import { describe, expect, it, vi } from "vitest";
import {
  AuditAction,
  IncidentStatus,
  CameraStatus,
  CommunityStatus,
  RecordingRequestStatus,
} from "@/generated/prisma/enums";
// Errors are verified via string matching on thrown messages
import { respondRecordingRequest } from "./respond-recording-request";
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
    findRecordingRequestById: vi.fn(async () => ({
      id: "recording-request-1",
      incidentId: "incident-1",
      cameraId: "camera-1",
      requestedById: "user-1",
      ownerId: "camera-owner-1",
      startTime: new Date("2026-06-27T10:00:00Z"),
      endTime: new Date("2026-06-27T10:25:00Z"),
      reason: "Need to review footage",
      status: RecordingRequestStatus.PENDING,
      ownerComment: null,
      createdAt: new Date("2026-06-27T12:00:00Z"),
    })),
    findActiveNeighborOrGuardMember: vi.fn(),
    findActiveAdminMember: vi.fn(),
    findActiveMember: vi.fn(),
    findActiveAdminOrGuardMember: vi.fn(),
    findSectorById: vi.fn(),
    createRecordingRequest: vi.fn(),
    updateRecordingRequest: vi.fn(async (_id, input) => ({
      id: "recording-request-1",
      incidentId: "incident-1",
      cameraId: "camera-1",
      requestedById: "user-1",
      ownerId: "camera-owner-1",
      startTime: new Date("2026-06-27T10:00:00Z"),
      endTime: new Date("2026-06-27T10:25:00Z"),
      reason: "Need to review footage",
      status: input.status ?? RecordingRequestStatus.PENDING,
      ownerComment: input.ownerComment ?? null,
      createdAt: new Date("2026-06-27T12:00:00Z"),
    })),
    createAuditLog: vi.fn(),
    runInTransaction: vi.fn(async (op) => op(repository)),
    ...overrides,
  };
  return repository;
}

const validInput = {
  actor: { id: "camera-owner-1" },
  recordingRequestId: "recording-request-1",
  action: "ACCEPT" as const,
  ownerComment: "Sure, I'll check the footage",
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("respondRecordingRequest", () => {
  it("owner accepts recording request → status ACCEPTED", async () => {
    const repository = createRepository();

    const result = await respondRecordingRequest(validInput, {
      recordingRequestRepository: repository,
    });

    expect(result.recordingRequest).toMatchObject({
      id: "recording-request-1",
      status: RecordingRequestStatus.ACCEPTED,
      ownerComment: "Sure, I'll check the footage",
    });

    expect(repository.createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: AuditAction.RECORDING_REQUEST_ACCEPTED,
        entityType: "RecordingRequest",
        entityId: "recording-request-1",
        communityId: "community-1",
        actorId: "camera-owner-1",
        metadata: {
          action: "ACCEPT",
          ownerComment: "Sure, I'll check the footage",
          cameraId: "camera-1",
          incidentId: "incident-1",
        },
      }),
    );
  });

  it("owner rejects recording request → status REJECTED", async () => {
    const repository = createRepository();

    const result = await respondRecordingRequest(
      {
        ...validInput,
        action: "REJECT" as const,
        ownerComment: "Not available during that time",
      },
      { recordingRequestRepository: repository },
    );

    expect(result.recordingRequest).toMatchObject({
      id: "recording-request-1",
      status: RecordingRequestStatus.REJECTED,
      ownerComment: "Not available during that time",
    });

    expect(repository.createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: AuditAction.RECORDING_REQUEST_REJECTED,
        entityType: "RecordingRequest",
        entityId: "recording-request-1",
        communityId: "community-1",
        actorId: "camera-owner-1",
        metadata: {
          action: "REJECT",
          ownerComment: "Not available during that time",
          cameraId: "camera-1",
          incidentId: "incident-1",
        },
      }),
    );
  });

  it("owner can accept without comment", async () => {
    const repository = createRepository();

    const result = await respondRecordingRequest(
      {
        actor: { id: "camera-owner-1" },
        recordingRequestId: "recording-request-1",
        action: "ACCEPT",
      },
      { recordingRequestRepository: repository },
    );

    expect(result.recordingRequest).toMatchObject({
      status: RecordingRequestStatus.ACCEPTED,
      ownerComment: null,
    });
  });

  it("rejects actor who is not the camera owner", async () => {
    const repository = createRepository();

    await expect(
      respondRecordingRequest(
        {
          ...validInput,
          actor: { id: "other-user" },
        },
        { recordingRequestRepository: repository },
      ),
    ).rejects.toThrow(
      "Only the camera owner can respond to a recording request",
    );

    expect(repository.updateRecordingRequest).not.toHaveBeenCalled();
    expect(repository.createAuditLog).not.toHaveBeenCalled();
  });

  it("rejects when recording request does not exist", async () => {
    const repository = createRepository({
      findRecordingRequestById: vi.fn(async () => null),
    });

    await expect(
      respondRecordingRequest(validInput, {
        recordingRequestRepository: repository,
      }),
    ).rejects.toThrow("Recording request not found");

    expect(repository.updateRecordingRequest).not.toHaveBeenCalled();
    expect(repository.createAuditLog).not.toHaveBeenCalled();
  });

  it("rejects when recording request is not PENDING", async () => {
    const repository = createRepository({
      findRecordingRequestById: vi.fn(async () => ({
        id: "recording-request-accepted",
        incidentId: "incident-1",
        cameraId: "camera-1",
        requestedById: "user-1",
        ownerId: "camera-owner-1",
        startTime: new Date("2026-06-27T10:00:00Z"),
        endTime: new Date("2026-06-27T10:25:00Z"),
        reason: "Need to review footage",
        status: RecordingRequestStatus.ACCEPTED,
        ownerComment: null,
        createdAt: new Date("2026-06-27T12:00:00Z"),
      })),
    });

    await expect(
      respondRecordingRequest(validInput, {
        recordingRequestRepository: repository,
      }),
    ).rejects.toThrow(
      "Recording request is not in PENDING status",
    );

    expect(repository.updateRecordingRequest).not.toHaveBeenCalled();
    expect(repository.createAuditLog).not.toHaveBeenCalled();
  });

  it("rejects when camera is not found", async () => {
    const repository = createRepository({
      findCameraById: vi.fn(async () => null),
    });

    await expect(
      respondRecordingRequest(validInput, {
        recordingRequestRepository: repository,
      }),
    ).rejects.toThrow("Camera not found");

    expect(repository.updateRecordingRequest).not.toHaveBeenCalled();
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
      respondRecordingRequest(validInput, {
        recordingRequestRepository: repository,
      }),
    ).rejects.toThrow("Camera is not active");

    expect(repository.updateRecordingRequest).not.toHaveBeenCalled();
    expect(repository.createAuditLog).not.toHaveBeenCalled();
  });

  it("rejects when incident is not found for recording request", async () => {
    const repository = createRepository({
      findIncidentById: vi.fn(async () => null),
    });

    await expect(
      respondRecordingRequest(validInput, {
        recordingRequestRepository: repository,
      }),
    ).rejects.toThrow("Incident not found for recording request");

    expect(repository.updateRecordingRequest).not.toHaveBeenCalled();
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
      respondRecordingRequest(validInput, {
        recordingRequestRepository: repository,
      }),
    ).rejects.toThrow(
      "Community is not active; recording requests are disabled",
    );

    expect(repository.updateRecordingRequest).not.toHaveBeenCalled();
    expect(repository.createAuditLog).not.toHaveBeenCalled();
  });

  it("rejects when community is not found", async () => {
    const repository = createRepository({
      findCommunityById: vi.fn(async () => null),
    });

    await expect(
      respondRecordingRequest(validInput, {
        recordingRequestRepository: repository,
      }),
    ).rejects.toThrow("Community not found");

    expect(repository.updateRecordingRequest).not.toHaveBeenCalled();
    expect(repository.createAuditLog).not.toHaveBeenCalled();
  });

  it("rejects empty recordingRequestId", async () => {
    const repository = createRepository();

    await expect(
      respondRecordingRequest(
        {
          ...validInput,
          recordingRequestId: "",
        },
        { recordingRequestRepository: repository },
      ),
    ).rejects.toThrow("recordingRequestId is required");

    expect(repository.runInTransaction).not.toHaveBeenCalled();
  });
});
