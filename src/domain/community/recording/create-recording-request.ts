import { AuditAction, RecordingRequestStatus } from "@/generated/prisma/enums";
import {
  CommunityAuthorizationError,
  CommunityInvariantError,
} from "@/domain/community/errors";
import type { RecordingRequestRepository } from "./recording-request-repository";

// ---------------------------------------------------------------------------
// Input
// ---------------------------------------------------------------------------

export type CreateRecordingRequestInput = {
  actor: { id: string };
  recordingRequest: {
    incidentId: string;
    cameraId: string;
    startTime: Date;
    endTime: Date;
    reason: string;
  };
};

// ---------------------------------------------------------------------------
// Result
// ---------------------------------------------------------------------------

export type CreateRecordingRequestResult = {
  recordingRequest: {
    id: string;
    incidentId: string;
    cameraId: string;
    requestedById: string;
    ownerId: string;
    startTime: Date;
    endTime: Date;
    reason: string;
    status: RecordingRequestStatus;
    ownerComment: string | null;
    createdAt: Date;
  };
};

// ---------------------------------------------------------------------------
// Deps
// ---------------------------------------------------------------------------

export type CreateRecordingRequestDeps = {
  recordingRequestRepository: RecordingRequestRepository;
};

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export async function createRecordingRequest(
  input: CreateRecordingRequestInput,
  { recordingRequestRepository }: CreateRecordingRequestDeps,
): Promise<CreateRecordingRequestResult> {
  const { recordingRequest } = input;

  // Validate required fields
  const incidentId = recordingRequest.incidentId.trim();
  if (!incidentId) {
    throw new CommunityInvariantError("incidentId is required");
  }

  const cameraId = recordingRequest.cameraId.trim();
  if (!cameraId) {
    throw new CommunityInvariantError("cameraId is required");
  }

  const reason = recordingRequest.reason.trim();
  if (!reason) {
    throw new CommunityInvariantError("reason is required");
  }

  // Validate time range
  const startTime = recordingRequest.startTime;
  const endTime = recordingRequest.endTime;

  if (!(startTime instanceof Date) || isNaN(startTime.getTime())) {
    throw new CommunityInvariantError("startTime must be a valid Date");
  }
  if (!(endTime instanceof Date) || isNaN(endTime.getTime())) {
    throw new CommunityInvariantError("endTime must be a valid Date");
  }
  if (startTime >= endTime) {
    throw new CommunityInvariantError("startTime must be before endTime");
  }

  const diffMs = endTime.getTime() - startTime.getTime();
  const maxMs = 30 * 60 * 1000; // 30 minutes
  if (diffMs > maxMs) {
    throw new CommunityInvariantError(
      "Recording request time range cannot exceed 30 minutes",
    );
  }

  return recordingRequestRepository.runInTransaction(async (tx) => {
    // 1. Find incident
    const incident = await tx.findIncidentById(incidentId);
    if (!incident) {
      throw new CommunityInvariantError("Incident not found");
    }

    // Incident must be OPEN or REVIEWING
    if (incident.status === "CLOSED") {
      throw new CommunityInvariantError(
        "Cannot request recordings for a closed incident",
      );
    }

    // 2. Community must be ACTIVE
    const community = await tx.findCommunityById(incident.communityId);
    if (!community) {
      throw new CommunityInvariantError("Community not found");
    }
    if (community.status !== "ACTIVE") {
      throw new CommunityInvariantError(
        "Community is not active; recording requests are disabled",
      );
    }

    // 3. Find camera
    const camera = await tx.findCameraById(cameraId);
    if (!camera) {
      throw new CommunityInvariantError("Camera not found");
    }

    // Camera must belong to the same community as the incident
    if (camera.communityId !== incident.communityId) {
      throw new CommunityInvariantError(
        "Camera does not belong to the incident's community",
      );
    }

    // Camera must be ACTIVE
    if (camera.status !== "ACTIVE") {
      throw new CommunityInvariantError("Camera is not active");
    }

    // 3. Check actor membership
    const neighborOrGuard =
      await tx.findActiveNeighborOrGuardMember(
        incident.communityId,
        input.actor.id,
      );
    const admin = await tx.findActiveAdminMember(
      incident.communityId,
      input.actor.id,
    );

    if (!neighborOrGuard && !admin) {
      throw new CommunityAuthorizationError(
        "Not an active member of this community",
      );
    }

    // 4. Actor must be incident creator, ADMIN, or GUARD
    const isAdmin = !!admin;
    const isGuard = neighborOrGuard?.role === "GUARD";
    const isCreator = incident.createdById === input.actor.id;

    if (!isCreator && !isAdmin && !isGuard) {
      throw new CommunityAuthorizationError(
        "Only the incident creator, ADMIN, or GUARD can request recordings",
      );
    }

    // 5. Create recording request
    const created = await tx.createRecordingRequest({
      incidentId: incident.id,
      cameraId: camera.id,
      requestedById: input.actor.id,
      ownerId: camera.ownerId,
      startTime,
      endTime,
      reason,
      status: RecordingRequestStatus.PENDING,
    });

    // 6. Audit
    await tx.createAuditLog({
      communityId: incident.communityId,
      actorId: input.actor.id,
      action: AuditAction.RECORDING_REQUEST_CREATED,
      entityType: "RecordingRequest",
      entityId: created.id,
      metadata: {
        incidentId: incident.id,
        cameraId: camera.id,
        ownerId: camera.ownerId,
        startTime: startTime.toISOString(),
        endTime: endTime.toISOString(),
        reason,
      },
    });

    return {
      recordingRequest: {
        id: created.id,
        incidentId: created.incidentId,
        cameraId: created.cameraId,
        requestedById: created.requestedById,
        ownerId: created.ownerId,
        startTime: created.startTime,
        endTime: created.endTime,
        reason: created.reason,
        status: created.status,
        ownerComment: created.ownerComment,
        createdAt: created.createdAt,
      },
    };
  });
}
