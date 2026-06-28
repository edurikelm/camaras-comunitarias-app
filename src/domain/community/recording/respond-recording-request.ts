import { AuditAction, RecordingRequestStatus } from "@/generated/prisma/enums";
import {
  CommunityAuthorizationError,
  CommunityInvariantError,
  CommunityNotFoundError,
} from "@/domain/community/errors";
import type { RecordingRequestRepository } from "./recording-request-repository";

// ---------------------------------------------------------------------------
// Input
// ---------------------------------------------------------------------------

export type RespondRecordingRequestInput = {
  actor: { id: string };
  recordingRequestId: string;
  action: "ACCEPT" | "REJECT";
  ownerComment?: string;
};

// ---------------------------------------------------------------------------
// Result
// ---------------------------------------------------------------------------

export type RespondRecordingRequestResult = {
  recordingRequest: {
    id: string;
    status: RecordingRequestStatus;
    ownerComment: string | null;
  };
};

// ---------------------------------------------------------------------------
// Deps
// ---------------------------------------------------------------------------

export type RespondRecordingRequestDeps = {
  recordingRequestRepository: RecordingRequestRepository;
};

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export async function respondRecordingRequest(
  input: RespondRecordingRequestInput,
  { recordingRequestRepository }: RespondRecordingRequestDeps,
): Promise<RespondRecordingRequestResult> {
  const requestId = input.recordingRequestId.trim();
  if (!requestId) {
    throw new CommunityInvariantError("recordingRequestId is required");
  }

  return recordingRequestRepository.runInTransaction(async (tx) => {
    // 1. Find recording request
    const request = await tx.findRecordingRequestById(requestId);
    if (!request) {
      throw new CommunityNotFoundError("Recording request not found");
    }

    // Must be PENDING
    if (request.status !== RecordingRequestStatus.PENDING) {
      throw new CommunityInvariantError(
        "Recording request is not in PENDING status",
      );
    }

    // 2. Find camera and verify ownership
    const camera = await tx.findCameraById(request.cameraId);
    if (!camera) {
      throw new CommunityNotFoundError("Camera not found");
    }

    // Actor must be the camera owner
    if (camera.ownerId !== input.actor.id) {
      throw new CommunityAuthorizationError(
        "Only the camera owner can respond to a recording request",
      );
    }

    // Camera must be ACTIVE
    if (camera.status !== "ACTIVE") {
      throw new CommunityInvariantError("Camera is not active");
    }

    // 3. Community must be ACTIVE
    const incident = await tx.findIncidentById(request.incidentId);
    if (!incident) {
      throw new CommunityNotFoundError("Incident not found for recording request");
    }
    const community = await tx.findCommunityById(incident.communityId);
    if (!community) {
      throw new CommunityNotFoundError("Community not found");
    }
    if (community.status !== "ACTIVE") {
      throw new CommunityInvariantError(
        "Community is not active; recording requests are disabled",
      );
    }

    // 4. Update recording request
    const newStatus =
      input.action === "ACCEPT"
        ? RecordingRequestStatus.ACCEPTED
        : RecordingRequestStatus.REJECTED;

    const updated = await tx.updateRecordingRequest(request.id, {
      status: newStatus,
      ownerComment: input.ownerComment ?? null,
    });

    // 5. Audit
    const auditAction =
      input.action === "ACCEPT"
        ? AuditAction.RECORDING_REQUEST_ACCEPTED
        : AuditAction.RECORDING_REQUEST_REJECTED;

    const communityId = incident.communityId;

    await tx.createAuditLog({
      communityId,
      actorId: input.actor.id,
      action: auditAction,
      entityType: "RecordingRequest",
      entityId: request.id,
      metadata: {
        action: input.action,
        ownerComment: input.ownerComment ?? null,
        cameraId: request.cameraId,
        incidentId: request.incidentId,
      },
    });

    return {
      recordingRequest: {
        id: updated.id,
        status: updated.status,
        ownerComment: updated.ownerComment,
      },
    };
  });
}
