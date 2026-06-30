import { describe, expect, it, vi } from "vitest";
import {
  AuditAction,
  IncidentType,
  AlertSeverity,
  IncidentStatus,
  CommunityMemberRole,
  CommunityMemberStatus,
  CommunityStatus,
} from "@/generated/prisma/enums";
import {
  CommunityInvariantError,
} from "@/domain/community/errors";
import { createIncident } from "./create-incident";
import type { IncidentRepository } from "./incident-repository";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createRepository(
  overrides: Partial<IncidentRepository> = {},
): IncidentRepository {
  const repository: IncidentRepository = {
    findCommunityById: vi.fn(async () => ({
      id: "community-1",
      name: "Barrio Norte",
      status: CommunityStatus.ACTIVE,
    })),
    findActiveMember: vi.fn(async () => ({
      id: "member-1",
      userId: "user-1",
      communityId: "community-1",
      role: CommunityMemberRole.NEIGHBOR,
      status: CommunityMemberStatus.ACTIVE,
    })),
    findActiveNeighborOrGuardMember: vi.fn(),
    findActiveAdminMember: vi.fn(),
    findActiveAdminOrGuardMember: vi.fn(),
    findSectorById: vi.fn(),
    createIncident: vi.fn(async (input) => ({
      id: "incident-1",
      communityId: input.communityId,
      createdById: input.createdById,
      sectorId: input.sectorId,
      type: input.type,
      severity: input.severity,
      status: IncidentStatus.OPEN,
      description: input.description,
      location: input.location,
      closedReason: null,
      closedAt: null,
      createdAt: new Date("2026-06-27T12:00:00Z"),
    })),
    createAlert: vi.fn(async (input) => ({
      id: "alert-1",
      communityId: input.communityId,
      incidentId: input.incidentId,
      sectorId: input.sectorId,
      severity: input.severity,
      type: input.type,
      message: input.message,
      createdAt: new Date("2026-06-27T12:00:00Z"),
    })),
    createAuditLog: vi.fn(),
    runInTransaction: vi.fn(async (op) => op(repository)),
    ...overrides,
  };
  return repository;
}

const validInput = {
  actor: { id: "user-1" },
  communityId: "community-1",
  incident: {
    type: IncidentType.THEFT,
    description: "Someone broke into a car on Main St",
    location: "Main St & 5th Ave",
    sectorId: undefined as string | undefined,
  },
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("createIncident", () => {
  it("NEIGHBOR crea incidente THEFT con severidad HIGH y alerta", async () => {
    const repository = createRepository();

    const result = await createIncident(validInput, { incidentRepository: repository });

    // Incident assertions
    expect(result.incident).toMatchObject({
      id: "incident-1",
      communityId: "community-1",
      type: IncidentType.THEFT,
      severity: AlertSeverity.HIGH,
      status: IncidentStatus.OPEN,
      description: "Someone broke into a car on Main St",
      location: "Main St & 5th Ave",
      sectorId: null,
    });
    expect(result.incident.createdAt).toBeInstanceOf(Date);

    // Alert assertions
    expect(result.alert).toMatchObject({
      id: "alert-1",
      severity: AlertSeverity.HIGH,
      message: "THEFT reportado en Main St & 5th Ave: Someone broke into a car on Main St",
    });

    // Audit
    expect(repository.createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: AuditAction.INCIDENT_CREATED,
        entityType: "Incident",
        entityId: "incident-1",
        communityId: "community-1",
        actorId: "user-1",
        metadata: {
          incidentType: IncidentType.THEFT,
          severity: AlertSeverity.HIGH,
          location: "Main St & 5th Ave",
          description: "Someone broke into a car on Main St",
          communityId: "community-1",
          alertId: "alert-1",
        },
      }),
    );
  });

  it("GUARD crea incidente correctamente", async () => {
    const repository = createRepository({
      findActiveMember: vi.fn(async () => ({
        id: "member-2",
        userId: "user-guard",
        communityId: "community-1",
        role: CommunityMemberRole.GUARD,
        status: CommunityMemberStatus.ACTIVE,
      })),
    });

    const result = await createIncident(
      { ...validInput, actor: { id: "user-guard" } },
      { incidentRepository: repository },
    );

    expect(result.incident).toMatchObject({
      communityId: "community-1",
      type: IncidentType.THEFT,
      severity: AlertSeverity.HIGH,
      status: IncidentStatus.OPEN,
    });
    expect(result.alert.severity).toBe(AlertSeverity.HIGH);
  });

  it("rechaza actor que no es miembro activo", async () => {
    const repository = createRepository({
      findActiveMember: vi.fn(async () => null),
    });

    await expect(
      createIncident(validInput, { incidentRepository: repository }),
    ).rejects.toThrow(
      "Only an ACTIVE community member can create an incident",
    );

    expect(repository.createIncident).not.toHaveBeenCalled();
    expect(repository.createAuditLog).not.toHaveBeenCalled();
  });

  it("ADMIN crea incidente correctamente (ADMIN incluye capacidades de NEIGHBOR)", async () => {
    const repository = createRepository({
      findActiveMember: vi.fn(async () => ({
        id: "member-admin",
        userId: "admin-user",
        communityId: "community-1",
        role: CommunityMemberRole.ADMIN,
        status: CommunityMemberStatus.ACTIVE,
      })),
    });

    const result = await createIncident(
      { ...validInput, actor: { id: "admin-user" } },
      { incidentRepository: repository },
    );

    expect(result.incident).toMatchObject({
      communityId: "community-1",
      type: IncidentType.THEFT,
    });
    expect(repository.createIncident).toHaveBeenCalled();
  });

  it("rechaza miembro BLOCKED", async () => {
    const repository = createRepository({
      findActiveMember: vi.fn(async () => null),
    });

    await expect(
      createIncident(
        { ...validInput, actor: { id: "blocked-user" } },
        { incidentRepository: repository },
      ),
    ).rejects.toThrow("Only an ACTIVE community member can create an incident");

    expect(repository.createIncident).not.toHaveBeenCalled();
    expect(repository.createAuditLog).not.toHaveBeenCalled();
  });

  it("rechaza comunidad inexistente", async () => {
    const repository = createRepository({
      findCommunityById: vi.fn(async () => null),
    });

    await expect(
      createIncident(validInput, { incidentRepository: repository }),
    ).rejects.toThrow("Community not found");

    expect(repository.createIncident).not.toHaveBeenCalled();
    expect(repository.createAuditLog).not.toHaveBeenCalled();
  });

  it("rechaza comunidad no ACTIVE", async () => {
    const repository = createRepository({
      findCommunityById: vi.fn(async () => ({
        id: "community-suspended",
        name: "Suspended Community",
        status: CommunityStatus.SUSPENDED,
      })),
    });

    await expect(
      createIncident(validInput, { incidentRepository: repository }),
    ).rejects.toThrow("Community is not active");

    expect(repository.createIncident).not.toHaveBeenCalled();
    expect(repository.createAuditLog).not.toHaveBeenCalled();
  });

  it("rechaza tipo de incidente invalido", async () => {
    const repository = createRepository();

    await expect(
      createIncident(
        {
          ...validInput,
          incident: { ...validInput.incident, type: "INVALID_TYPE" as IncidentType },
        },
        { incidentRepository: repository },
      ),
    ).rejects.toThrow("Invalid incident type");

    expect(repository.runInTransaction).not.toHaveBeenCalled();
  });

  it("rechaza description vacia", async () => {
    const repository = createRepository();

    await expect(
      createIncident(
        {
          ...validInput,
          incident: { ...validInput.incident, description: "   " },
        },
        { incidentRepository: repository },
      ),
    ).rejects.toThrow("Incident description is required");

    expect(repository.runInTransaction).not.toHaveBeenCalled();
  });

  it("rechaza sectorId que no pertenece a la comunidad", async () => {
    const repository = createRepository({
      findSectorById: vi.fn(async () => ({
        id: "sector-other",
        communityId: "other-community",
        name: "Other Sector",
      })),
    });

    await expect(
      createIncident(
        {
          ...validInput,
          incident: { ...validInput.incident, sectorId: "sector-other" },
        },
        { incidentRepository: repository },
      ),
    ).rejects.toThrow("Sector does not belong to this community");

    expect(repository.createIncident).not.toHaveBeenCalled();
    expect(repository.createAuditLog).not.toHaveBeenCalled();
  });

  it("rechaza sectorId inexistente", async () => {
    const repository = createRepository({
      findSectorById: vi.fn(async () => null),
    });

    await expect(
      createIncident(
        {
          ...validInput,
          incident: { ...validInput.incident, sectorId: "sector-nonexistent" },
        },
        { incidentRepository: repository },
      ),
    ).rejects.toThrow("Sector not found");

    expect(repository.createIncident).not.toHaveBeenCalled();
    expect(repository.createAuditLog).not.toHaveBeenCalled();
  });

  it("asigna severidad EMERGENCY → CRITICAL", async () => {
    const repository = createRepository();

    const result = await createIncident(
      {
        ...validInput,
        incident: { ...validInput.incident, type: IncidentType.EMERGENCY },
      },
      { incidentRepository: repository },
    );

    expect(result.incident.severity).toBe(AlertSeverity.CRITICAL);
    expect(result.alert.severity).toBe(AlertSeverity.CRITICAL);
  });

  it("asigna severidad SUSPICIOUS_PERSON → MEDIUM", async () => {
    const repository = createRepository();

    const result = await createIncident(
      {
        ...validInput,
        incident: { ...validInput.incident, type: IncidentType.SUSPICIOUS_PERSON },
      },
      { incidentRepository: repository },
    );

    expect(result.incident.severity).toBe(AlertSeverity.MEDIUM);
  });

  it("asigna severidad SUSPICIOUS_VEHICLE → MEDIUM", async () => {
    const repository = createRepository();

    const result = await createIncident(
      {
        ...validInput,
        incident: { ...validInput.incident, type: IncidentType.SUSPICIOUS_VEHICLE },
      },
      { incidentRepository: repository },
    );

    expect(result.incident.severity).toBe(AlertSeverity.MEDIUM);
  });

  it("asigna severidad OTHER → LOW", async () => {
    const repository = createRepository();

    const result = await createIncident(
      {
        ...validInput,
        incident: { ...validInput.incident, type: IncidentType.OTHER },
      },
      { incidentRepository: repository },
    );

    expect(result.incident.severity).toBe(AlertSeverity.LOW);
  });

  it("incluye sectorId cuando se proporciona", async () => {
    const repository = createRepository({
      findSectorById: vi.fn(async () => ({
        id: "sector-1",
        communityId: "community-1",
        name: "North Side",
      })),
    });

    const result = await createIncident(
      {
        ...validInput,
        incident: { ...validInput.incident, sectorId: "sector-1" },
      },
      { incidentRepository: repository },
    );

    expect(result.incident.sectorId).toBe("sector-1");
    // Alert message should not include location since it's not set
    expect(result.alert.message).toContain("THEFT reportado en Main St & 5th Ave");
  });

  it("construye mensaje de alerta sin location cuando no se provee", async () => {
    const repository = createRepository();

    const result = await createIncident(
      {
        ...validInput,
        incident: { type: IncidentType.OTHER, description: "Noise complaint", location: undefined },
      },
      { incidentRepository: repository },
    );

    expect(result.alert.message).toBe("OTHER reportado: Noise complaint");
  });

  it("construye mensaje de alerta sin location cuando location es solo espacios", async () => {
    const repository = createRepository();

    const result = await createIncident(
      {
        ...validInput,
        incident: { ...validInput.incident, location: "   " },
      },
      { incidentRepository: repository },
    );

    expect(result.alert.message).toBe("THEFT reportado: Someone broke into a car on Main St");
  });

  it("rechaza communityId vacio", async () => {
    const repository = createRepository();

    await expect(
      createIncident(
        { ...validInput, communityId: "" },
        { incidentRepository: repository },
      ),
    ).rejects.toThrow(CommunityInvariantError);

    expect(repository.runInTransaction).not.toHaveBeenCalled();
  });

  it("SEVERIDAD ACCIDENT → HIGH", async () => {
    const repository = createRepository();

    const result = await createIncident(
      {
        ...validInput,
        incident: { ...validInput.incident, type: IncidentType.ACCIDENT },
      },
      { incidentRepository: repository },
    );

    expect(result.incident.severity).toBe(AlertSeverity.HIGH);
  });

  it("emits alert.created and incident.created after successful incident creation", async () => {
    const repository = createRepository();
    const emitRealtimeEvent = vi.fn().mockResolvedValue(undefined);

    const result = await createIncident(validInput, {
      incidentRepository: repository,
      emitRealtimeEvent,
    });

    // Verify incident returned with createdById
    expect(result.incident.createdById).toBe("user-1");

    // Verify emitRealtimeEvent was called twice: alert.created then incident.created
    expect(emitRealtimeEvent).toHaveBeenCalledTimes(2);

    const [firstCall, secondCall] = emitRealtimeEvent.mock.calls;

    // First call: alert.created
    expect(firstCall[0].type).toBe("alert.created");
    expect(firstCall[0].payload.alertId).toBe("alert-1");
    expect(firstCall[0].payload.severity).toBe("HIGH");

    // Second call: incident.created
    expect(secondCall[0].type).toBe("incident.created");
    expect(secondCall[0].payload.incidentId).toBe("incident-1");
    expect(secondCall[0].payload.createdById).toBe("user-1");

    // THEFT = HIGH without sector → audience should be communityRoom + roleAdminGuardRoom
    const audience = firstCall[0].audience;
    expect(audience.roomKeys).toContain("community:community-1");
    expect(audience.roomKeys).toContain("role:admin-guard:community:community-1");
  });
});
