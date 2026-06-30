import { describe, expect, it, vi } from "vitest";
import {
  AuditAction,
  IncidentStatus,
  CameraStatus,
  CommunityStatus,
  RecordingRequestStatus,
  CommunityMemberRole,
  CommunityMemberStatus,
} from "@/generated/prisma/enums";
// Errors are verified via string matching on thrown messages
import { createRecordingRequest } from "./create-recording-request";
import type { RecordingRequestRepository } from "./recording-request-repository";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createRepository(
  overrides: Partial<RecordingRequestRepository> = {},
): RecordingRequestRepository {
  const repository: RecordingRequestRepository = {
    findCommunityById: vi.fn(async () => ({
      id: "community-1",
      name: "Barrio Norte",
      status: CommunityStatus.ACTIVE,
    })),
    findIncidentById: vi.fn(async () => ({
      id: "incident-1",
      communityId: "community-1",
      createdById: "user-1",
      status: IncidentStatus.OPEN,
    })),
    findCameraById: vi.fn(async () => ({
      id: "camera-1",
      communityId: "community-1",
      ownerId: "camera-owner-1",
      status: CameraStatus.ACTIVE,
    })),
    findRecordingRequestById: vi.fn(),
    findActiveNeighborOrGuardMember: vi.fn(async () => ({
      id: "member-1",
      userId: "user-1",
      communityId: "community-1",
      role: CommunityMemberRole.NEIGHBOR,
      status: CommunityMemberStatus.ACTIVE,
    })),
    findActiveAdminMember: vi.fn(),
    findActiveMember: vi.fn(),
    findActiveAdminOrGuardMember: vi.fn(),
    findSectorById: vi.fn(),
    createRecordingRequest: vi.fn(async (input) => ({
      id: "recording-request-1",
      incidentId: input.incidentId,
      cameraId: input.cameraId,
      requestedById: input.requestedById,
      ownerId: input.ownerId,
      startTime: input.startTime,
      endTime: input.endTime,
      reason: input.reason,
      status: RecordingRequestStatus.PENDING,
      ownerComment: null,
      createdAt: new Date("2026-06-27T12:00:00Z"),
    })),
    updateRecordingRequest: vi.fn(),
    createAuditLog: vi.fn(),
    runInTransaction: vi.fn(async (op) => op(repository)),
    ...overrides,
  };
  return repository;
}

const validInput = {
  actor: { id: "user-1" },
  recordingRequest: {
    incidentId: "incident-1",
    cameraId: "camera-1",
    startTime: new Date("2026-06-27T10:00:00Z"),
    endTime: new Date("2026-06-27T10:25:00Z"),
    reason: "Need to review footage of a theft",
  },
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("createRecordingRequest", () => {
  it("creates recording request when actor is incident creator (NEIGHBOR)", async () => {
    const repository = createRepository();

    const result = await createRecordingRequest(validInput, {
      recordingRequestRepository: repository,
    });

    expect(result.recordingRequest).toMatchObject({
      id: "recording-request-1",
      incidentId: "incident-1",
      cameraId: "camera-1",
      requestedById: "user-1",
      ownerId: "camera-owner-1",
      startTime: validInput.recordingRequest.startTime,
      endTime: validInput.recordingRequest.endTime,
      reason: "Need to review footage of a theft",
      status: RecordingRequestStatus.PENDING,
      ownerComment: null,
    });
    expect(result.recordingRequest.createdAt).toBeInstanceOf(Date);

    // Audit
    expect(repository.createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: AuditAction.RECORDING_REQUEST_CREATED,
        entityType: "RecordingRequest",
        entityId: "recording-request-1",
        communityId: "community-1",
        actorId: "user-1",
        metadata: {
          incidentId: "incident-1",
          cameraId: "camera-1",
          ownerId: "camera-owner-1",
          startTime: validInput.recordingRequest.startTime.toISOString(),
          endTime: validInput.recordingRequest.endTime.toISOString(),
          reason: "Need to review footage of a theft",
        },
      }),
    );
  });

  it("creates recording request when actor is ADMIN", async () => {
    const repository = createRepository({
      findActiveNeighborOrGuardMember: vi.fn(),
      findActiveAdminMember: vi.fn(async () => ({
        id: "admin-member-1",
        userId: "admin-user",
        communityId: "community-1",
        role: CommunityMemberRole.ADMIN,
        status: CommunityMemberStatus.ACTIVE,
      })),
    });

    const result = await createRecordingRequest(
      { ...validInput, actor: { id: "admin-user" } },
      { recordingRequestRepository: repository },
    );

    expect(result.recordingRequest).toMatchObject({
      id: "recording-request-1",
      status: RecordingRequestStatus.PENDING,
    });
  });

  it("creates recording request when actor is GUARD", async () => {
    const repository = createRepository({
      findActiveNeighborOrGuardMember: vi.fn(async () => ({
        id: "guard-member-1",
        userId: "guard-user",
        communityId: "community-1",
        role: CommunityMemberRole.GUARD,
        status: CommunityMemberStatus.ACTIVE,
      })),
      findActiveAdminMember: vi.fn(),
    });

    const result = await createRecordingRequest(
      { ...validInput, actor: { id: "guard-user" } },
      { recordingRequestRepository: repository },
    );

    expect(result.recordingRequest).toMatchObject({
      id: "recording-request-1",
      status: RecordingRequestStatus.PENDING,
    });
  });

  it("rejects actor who is not an active member of the community", async () => {
    const repository = createRepository({
      findActiveNeighborOrGuardMember: vi.fn(async () => null),
      findActiveAdminMember: vi.fn(async () => null),
    });

    await expect(
      createRecordingRequest(validInput, {
        recordingRequestRepository: repository,
      }),
    ).rejects.toThrow(
      "Not an active member of this community",
    );

    expect(repository.createRecordingRequest).not.toHaveBeenCalled();
    expect(repository.createAuditLog).not.toHaveBeenCalled();
  });

  it("rejects NEIGHBOR who is not the incident creator", async () => {
    const repository = createRepository({
      // incident created by a different user
      findIncidentById: vi.fn(async () => ({
        id: "incident-1",
        communityId: "community-1",
        createdById: "other-user",
        status: IncidentStatus.OPEN,
      })),
      findActiveNeighborOrGuardMember: vi.fn(async () => ({
        id: "member-other",
        userId: "user-1",
        communityId: "community-1",
        role: CommunityMemberRole.NEIGHBOR,
        status: CommunityMemberStatus.ACTIVE,
      })),
      findActiveAdminMember: vi.fn(),
    });

    await expect(
      createRecordingRequest(validInput, {
        recordingRequestRepository: repository,
      }),
    ).rejects.toThrow(
      "Only the incident creator, ADMIN, or GUARD can request recordings",
    );

    expect(repository.createRecordingRequest).not.toHaveBeenCalled();
    expect(repository.createAuditLog).not.toHaveBeenCalled();
  });

  it("rejects when incident does not exist", async () => {
    const repository = createRepository({
      findIncidentById: vi.fn(async () => null),
    });

    await expect(
      createRecordingRequest(validInput, {
        recordingRequestRepository: repository,
      }),
    ).rejects.toThrow("Incident not found");

    expect(repository.createRecordingRequest).not.toHaveBeenCalled();
    expect(repository.createAuditLog).not.toHaveBeenCalled();
  });

  it("rejects when incident is CLOSED", async () => {
    const repository = createRepository({
      findIncidentById: vi.fn(async () => ({
        id: "incident-closed",
        communityId: "community-1",
        createdById: "user-1",
        status: IncidentStatus.CLOSED,
      })),
    });

    await expect(
      createRecordingRequest(validInput, {
        recordingRequestRepository: repository,
      }),
    ).rejects.toThrow(
      "Cannot request recordings for a closed incident",
    );

    expect(repository.createRecordingRequest).not.toHaveBeenCalled();
    expect(repository.createAuditLog).not.toHaveBeenCalled();
  });

  it("rejects when camera does not exist", async () => {
    const repository = createRepository({
      findCameraById: vi.fn(async () => null),
    });

    await expect(
      createRecordingRequest(validInput, {
        recordingRequestRepository: repository,
      }),
    ).rejects.toThrow("Camera not found");

    expect(repository.createRecordingRequest).not.toHaveBeenCalled();
    expect(repository.createAuditLog).not.toHaveBeenCalled();
  });

  it("rejects when camera belongs to a different community", async () => {
    const repository = createRepository({
      findCameraById: vi.fn(async () => ({
        id: "camera-other",
        communityId: "other-community",
        ownerId: "camera-owner-1",
        status: CameraStatus.ACTIVE,
      })),
    });

    await expect(
      createRecordingRequest(validInput, {
        recordingRequestRepository: repository,
      }),
    ).rejects.toThrow(
      "Camera does not belong to the incident's community",
    );

    expect(repository.createRecordingRequest).not.toHaveBeenCalled();
    expect(repository.createAuditLog).not.toHaveBeenCalled();
  });

  it("rejects when camera is not ACTIVE", async () => {
    const repository = createRepository({
      findCameraById: vi.fn(async () => ({
        id: "camera-inactive",
        communityId: "community-1",
        ownerId: "camera-owner-1",
        status: CameraStatus.INACTIVE,
      })),
    });

    await expect(
      createRecordingRequest(validInput, {
        recordingRequestRepository: repository,
      }),
    ).rejects.toThrow("Camera is not active");

    expect(repository.createRecordingRequest).not.toHaveBeenCalled();
    expect(repository.createAuditLog).not.toHaveBeenCalled();
  });

  it("rejects when community is not found", async () => {
    const repository = createRepository({
      findCommunityById: vi.fn(async () => null),
    });

    await expect(
      createRecordingRequest(validInput, {
        recordingRequestRepository: repository,
      }),
    ).rejects.toThrow("Community not found");

    expect(repository.createRecordingRequest).not.toHaveBeenCalled();
    expect(repository.createAuditLog).not.toHaveBeenCalled();
  });

  it("rejects when community is SUSPENDED", async () => {
    const repository = createRepository({
      findCommunityById: vi.fn(async () => ({
        id: "community-1",
        name: "Barrio Norte",
        status: CommunityStatus.SUSPENDED,
      })),
    });

    await expect(
      createRecordingRequest(validInput, {
        recordingRequestRepository: repository,
      }),
    ).rejects.toThrow(
      "Community is not active; recording requests are disabled",
    );

    expect(repository.createRecordingRequest).not.toHaveBeenCalled();
    expect(repository.createAuditLog).not.toHaveBeenCalled();
  });

  it("rejects when community is ARCHIVED", async () => {
    const repository = createRepository({
      findCommunityById: vi.fn(async () => ({
        id: "community-1",
        name: "Barrio Norte",
        status: CommunityStatus.ARCHIVED,
      })),
    });

    await expect(
      createRecordingRequest(validInput, {
        recordingRequestRepository: repository,
      }),
    ).rejects.toThrow(
      "Community is not active; recording requests are disabled",
    );

    expect(repository.createRecordingRequest).not.toHaveBeenCalled();
    expect(repository.createAuditLog).not.toHaveBeenCalled();
  });

  it("rejects when startTime is an invalid date", async () => {
    const repository = createRepository();

    await expect(
      createRecordingRequest(
        {
          ...validInput,
          recordingRequest: {
            ...validInput.recordingRequest,
            startTime: new Date(""),
          },
        },
        { recordingRequestRepository: repository },
      ),
    ).rejects.toThrow("startTime must be a valid Date");

    expect(repository.createRecordingRequest).not.toHaveBeenCalled();
    expect(repository.createAuditLog).not.toHaveBeenCalled();
  });

  it("rejects when startTime >= endTime", async () => {
    const repository = createRepository();

    await expect(
      createRecordingRequest(
        {
          ...validInput,
          recordingRequest: {
            ...validInput.recordingRequest,
            startTime: new Date("2026-06-27T10:30:00Z"),
            endTime: new Date("2026-06-27T10:00:00Z"),
          },
        },
        { recordingRequestRepository: repository },
      ),
    ).rejects.toThrow("startTime must be before endTime");

    expect(repository.createRecordingRequest).not.toHaveBeenCalled();
    expect(repository.createAuditLog).not.toHaveBeenCalled();
  });

  it("rejects when time range exceeds 30 minutes", async () => {
    const repository = createRepository();

    await expect(
      createRecordingRequest(
        {
          ...validInput,
          recordingRequest: {
            ...validInput.recordingRequest,
            startTime: new Date("2026-06-27T10:00:00Z"),
            endTime: new Date("2026-06-27T10:31:00Z"),
          },
        },
        { recordingRequestRepository: repository },
      ),
    ).rejects.toThrow(
      "Recording request time range cannot exceed 30 minutes",
    );

    expect(repository.createRecordingRequest).not.toHaveBeenCalled();
    expect(repository.createAuditLog).not.toHaveBeenCalled();
  });

  it("allows exactly 30 minute range", async () => {
    const repository = createRepository();

    const result = await createRecordingRequest(
      {
        ...validInput,
        recordingRequest: {
          ...validInput.recordingRequest,
          startTime: new Date("2026-06-27T10:00:00Z"),
          endTime: new Date("2026-06-27T10:30:00Z"),
        },
      },
      { recordingRequestRepository: repository },
    );

    expect(result.recordingRequest.status).toBe(RecordingRequestStatus.PENDING);
  });

  it("rejects empty reason", async () => {
    const repository = createRepository();

    await expect(
      createRecordingRequest(
        {
          ...validInput,
          recordingRequest: {
            ...validInput.recordingRequest,
            reason: "   ",
          },
        },
        { recordingRequestRepository: repository },
      ),
    ).rejects.toThrow("reason is required");

    expect(repository.createRecordingRequest).not.toHaveBeenCalled();
    expect(repository.createAuditLog).not.toHaveBeenCalled();
  });

  it("rejects empty incidentId", async () => {
    const repository = createRepository();

    await expect(
      createRecordingRequest(
        {
          ...validInput,
          recordingRequest: {
            ...validInput.recordingRequest,
            incidentId: "",
          },
        },
        { recordingRequestRepository: repository },
      ),
    ).rejects.toThrow("incidentId is required");

    expect(repository.runInTransaction).not.toHaveBeenCalled();
  });

  it("rejects empty cameraId", async () => {
    const repository = createRepository();

    await expect(
      createRecordingRequest(
        {
          ...validInput,
          recordingRequest: {
            ...validInput.recordingRequest,
            cameraId: "",
          },
        },
        { recordingRequestRepository: repository },
      ),
    ).rejects.toThrow("cameraId is required");

    expect(repository.runInTransaction).not.toHaveBeenCalled();
  });

  it("emits recording-request.created after successful creation", async () => {
    const repository = createRepository();
    const emitRealtimeEvent = vi.fn().mockResolvedValue(undefined);

    const result = await createRecordingRequest(validInput, {
      recordingRequestRepository: repository,
      emitRealtimeEvent,
    });

    expect(result.recordingRequest.status).toBe(RecordingRequestStatus.PENDING);

    expect(emitRealtimeEvent).toHaveBeenCalledTimes(1);
    expect(emitRealtimeEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "recording-request.created",
        audience: expect.objectContaining({
          roomKeys: expect.arrayContaining(["user:camera-owner-1"]),
        }),
        payload: expect.objectContaining({
          requestId: "recording-request-1",
          incidentId: "incident-1",
          cameraId: "camera-1",
          ownerId: "camera-owner-1",
          requesterId: "user-1",
        }),
      }),
    );
  });
});
