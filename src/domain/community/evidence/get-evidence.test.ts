import { describe, expect, it, vi } from "vitest";
import {
  AuditAction,
  IncidentStatus,
  CommunityMemberRole,
  CommunityMemberStatus,
} from "@/generated/prisma/enums";
import {
  CommunityAuthorizationError,
  CommunityInvariantError,
} from "@/domain/community/errors";
import { getEvidence } from "./get-evidence";
import type { EvidenceRepository } from "./evidence-repository";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createRepository(
  overrides: Partial<EvidenceRepository> = {},
): EvidenceRepository {
  const repository: EvidenceRepository = {
    findCommunityById: vi.fn(async () => ({
      id: "community-1",
      name: "Test Community",
      status: "ACTIVE" as const,
    })),
    findActiveMember: vi.fn(),
    findActiveAdminOrGuardMember: vi.fn(),
    findIncidentById: vi.fn(async (communityId, incidentId) => ({
      id: incidentId,
      communityId,
      createdById: "incident-creator",
      status: IncidentStatus.OPEN,
    })),
    findEvidenceByIncident: vi.fn(async () => [
      {
        id: "ev-1",
        communityId: "community-1",
        incidentId: "incident-1",
        uploadedById: "user-uploader",
        storagePath: "community-1/incident-1/uuid-1.jpg",
        mimeType: "image/jpeg",
        metadata: null,
        createdAt: new Date("2026-06-27T12:00:00Z"),
        deletedAt: null,
      },
      {
        id: "ev-2",
        communityId: "community-1",
        incidentId: "incident-1",
        uploadedById: "user-uploader",
        storagePath: "community-1/incident-1/uuid-2.png",
        mimeType: "image/png",
        metadata: { description: "Close-up" },
        createdAt: new Date("2026-06-27T12:05:00Z"),
        deletedAt: null,
      },
    ]),
    createEvidence: vi.fn(),
    uploadFile: vi.fn(),
    createSignedUrl: vi.fn(async (storagePath) => {
      const ext = storagePath.split(".").pop();
      return `https://supabase.co/storage/v1/object/signed/evidence/${storagePath}?token=signed-${ext}`;
    }),
    createAuditLog: vi.fn(),
    runInTransaction: vi.fn(async (op) => op(repository)),
    ...overrides,
  };
  return repository;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("getEvidence", () => {
  it("el creador del incidente puede ver la evidencia", async () => {
    const repository = createRepository();

    const result = await getEvidence(
      {
        actor: { id: "incident-creator" },
        communityId: "community-1",
        incidentId: "incident-1",
      },
      { evidenceRepository: repository },
    );

    expect(result.items).toHaveLength(2);
    expect(result.items[0]).toMatchObject({
      id: "ev-1",
      mimeType: "image/jpeg",
    });
    expect(result.items[0].signedUrl).toContain("signed-jpg");
    expect(result.items[1].mimeType).toBe("image/png");
    expect(result.items[1].signedUrl).toContain("signed-png");
  });

  it("ADMIN activo puede ver evidencia", async () => {
    const repository = createRepository({
      findActiveAdminOrGuardMember: vi.fn(async () => ({
        id: "member-admin",
        userId: "admin-user",
        communityId: "community-1",
        role: CommunityMemberRole.ADMIN,
        status: CommunityMemberStatus.ACTIVE,
      })),
    });

    const result = await getEvidence(
      {
        actor: { id: "admin-user" },
        communityId: "community-1",
        incidentId: "incident-1",
      },
      { evidenceRepository: repository },
    );

    expect(result.items).toHaveLength(2);
  });

  it("GUARD activo puede ver evidencia", async () => {
    const repository = createRepository({
      findActiveAdminOrGuardMember: vi.fn(async () => ({
        id: "member-guard",
        userId: "guard-user",
        communityId: "community-1",
        role: CommunityMemberRole.GUARD,
        status: CommunityMemberStatus.ACTIVE,
      })),
    });

    const result = await getEvidence(
      {
        actor: { id: "guard-user" },
        communityId: "community-1",
        incidentId: "incident-1",
      },
      { evidenceRepository: repository },
    );

    expect(result.items).toHaveLength(2);
  });

  it("NEIGHBOR no puede ver evidencia (no es creador ni ADMIN/GUARD)", async () => {
    const repository = createRepository({
      findActiveAdminOrGuardMember: vi.fn(async () => null),
    });

    await expect(
      getEvidence(
        {
          actor: { id: "neighbor-user" },
          communityId: "community-1",
          incidentId: "incident-1",
        },
        { evidenceRepository: repository },
      ),
    ).rejects.toThrow(CommunityAuthorizationError);
  });

  it("audita EVIDENCE_VIEWED por cada evidencia", async () => {
    const repository = createRepository();

    await getEvidence(
      {
        actor: { id: "incident-creator" },
        communityId: "community-1",
        incidentId: "incident-1",
      },
      { evidenceRepository: repository },
    );

    expect(repository.createAuditLog).toHaveBeenCalledTimes(2);
    expect(repository.createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: AuditAction.EVIDENCE_VIEWED,
        entityType: "Evidence",
        entityId: "ev-1",
      }),
    );
    expect(repository.createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: AuditAction.EVIDENCE_VIEWED,
        entityType: "Evidence",
        entityId: "ev-2",
      }),
    );
  });

  it("rechaza incidente inexistente", async () => {
    const repository = createRepository({
      findIncidentById: vi.fn(async () => null),
    });

    await expect(
      getEvidence(
        {
          actor: { id: "incident-creator" },
          communityId: "community-1",
          incidentId: "nonexistent-incident",
        },
        { evidenceRepository: repository },
      ),
    ).rejects.toThrow("Incident not found");
  });

  it("rechaza cuando la comunidad no esta ACTIVE (SUSPENDED)", async () => {
    const repository = createRepository({
      findCommunityById: vi.fn(async () => ({
        id: "community-1",
        name: "Test Community",
        status: "SUSPENDED" as const,
      })),
    });

    await expect(
      getEvidence(
        {
          actor: { id: "incident-creator" },
          communityId: "community-1",
          incidentId: "incident-1",
        },
        { evidenceRepository: repository },
      ),
    ).rejects.toThrow(CommunityInvariantError);
    await expect(
      getEvidence(
        {
          actor: { id: "incident-creator" },
          communityId: "community-1",
          incidentId: "incident-1",
        },
        { evidenceRepository: repository },
      ),
    ).rejects.toThrow("Community is not active");
  });

  it("retorna lista vacia cuando no hay evidencia", async () => {
    const repository = createRepository({
      findEvidenceByIncident: vi.fn(async () => []),
    });

    const result = await getEvidence(
      {
        actor: { id: "incident-creator" },
        communityId: "community-1",
        incidentId: "incident-empty",
      },
      { evidenceRepository: repository },
    );

    expect(result.items).toHaveLength(0);
  });

  it("retorna metadata cuando existe", async () => {
    const repository = createRepository();

    const result = await getEvidence(
      {
        actor: { id: "incident-creator" },
        communityId: "community-1",
        incidentId: "incident-1",
      },
      { evidenceRepository: repository },
    );

    expect(result.items[1].metadata).toEqual({ description: "Close-up" });
  });

  it("no permite que NEIGHBOR que no es creador vea evidencia aunque el incidente exista", async () => {
    const repository = createRepository({
      findActiveAdminOrGuardMember: vi.fn(async () => null),
    });

    await expect(
      getEvidence(
        {
          actor: { id: "other-neighbor" },
          communityId: "community-1",
          incidentId: "incident-1",
        },
        { evidenceRepository: repository },
      ),
    ).rejects.toThrow(
      "Only the incident creator, an ADMIN, or a GUARD can view evidence",
    );
  });

  it("el creador del incidente puede ver evidencia incluso si no es miembro activo", async () => {
    const repository = createRepository();

    const result = await getEvidence(
      {
        actor: { id: "incident-creator" },
        communityId: "community-1",
        incidentId: "incident-1",
      },
      { evidenceRepository: repository },
    );

    expect(result.items).toHaveLength(2);
    // verify that findActiveAdminOrGuardMember was NEVER called
    expect(
      repository.findActiveAdminOrGuardMember,
    ).not.toHaveBeenCalled();
  });
});
