import { AuditAction, RecordingRequestStatus } from "@/generated/prisma/enums";
import {
  CommunityInvariantError,
  CommunityNotFoundError,
} from "@/domain/community/errors";
import type { RecordingRequestRepository } from "./recording-request-repository";
import { ensureCanRespondRecording } from "@/domain/community/policies";
import { emitRealtimeEvent } from "@/lib/realtime/emit-realtime-event";

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
  emitRealtimeEvent?: typeof emitRealtimeEvent;
};

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export async function respondRecordingRequest(
  input: RespondRecordingRequestInput,
  { recordingRequestRepository, emitRealtimeEvent: emitFn }: RespondRecordingRequestDeps,
): Promise<RespondRecordingRequestResult> {
  const requestId = input.recordingRequestId.trim();
  if (!requestId) {
    throw new CommunityInvariantError("recordingRequestId is required");
  }

  // Capture requesterId, communityId, and cameraId before the transaction returns
  let requesterId: string = "";
  let communityId: string = "";
  let cameraId: string = "";
  const respondedAt = new Date();

  const result = await recordingRequestRepository.runInTransaction(async (tx) => {
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

    // Capture for emit
    requesterId = request.requestedById;
    cameraId = request.cameraId;

    // 2. Find camera and validate ownership via policy
    const { camera, incident } = await ensureCanRespondRecording({
      client: tx,
      actor: input.actor,
      request,
    });

    // 3. Validate camera is ACTIVE (resource state invariant)
    if (camera.status !== "ACTIVE") {
      throw new CommunityInvariantError("Camera is not active");
    }

    // 4. Validate community is ACTIVE
    const community = await tx.findCommunityById(incident.communityId);
    if (!community) {
      throw new CommunityNotFoundError("Community not found");
    }
    if (community.status !== "ACTIVE") {
      throw new CommunityInvariantError(
        "Community is not active; recording requests are disabled",
      );
    }

    communityId = incident.communityId;

    // 5. Update recording request
    const newStatus =
      input.action === "ACCEPT"
        ? RecordingRequestStatus.ACCEPTED
        : RecordingRequestStatus.REJECTED;

    const updated = await tx.updateRecordingRequest(request.id, {
      status: newStatus,
      ownerComment: input.ownerComment ?? null,
    });

    // 6. Audit
    const auditAction =
      input.action === "ACCEPT"
        ? AuditAction.RECORDING_REQUEST_ACCEPTED
        : AuditAction.RECORDING_REQUEST_REJECTED;

    await tx.createAuditLog({
      communityId: incident.communityId,
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

  // Emit realtime event (best-effort, fuera de la transacción)
  // Audience: DM al requester
  const emit = emitFn ?? emitRealtimeEvent;
  await emit({
    type: "recording-request.responded",
    communityId,
    audience: { roomKeys: [`user:${requesterId}`], userIds: [] },
    payload: {
      requestId: result.recordingRequest.id,
      cameraId,
      requesterId,
      communityId,
      status: result.recordingRequest.status,
      responseComment: result.recordingRequest.ownerComment,
      respondedAt: respondedAt.toISOString(),
    },
  });

  return result;
}
