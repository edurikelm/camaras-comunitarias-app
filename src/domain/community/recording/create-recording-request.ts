import { AuditAction, RecordingRequestStatus } from "@/generated/prisma/enums";
import { CommunityInvariantError } from "@/domain/community/errors";
import type { RecordingRequestRepository } from "./recording-request-repository";
import { ensureCanRequestRecording } from "@/domain/community/policies";
import { emitRealtimeEvent } from "@/lib/realtime/emit-realtime-event";

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
  emitRealtimeEvent?: typeof emitRealtimeEvent;
};

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export async function createRecordingRequest(
  input: CreateRecordingRequestInput,
  { recordingRequestRepository, emitRealtimeEvent: emitFn }: CreateRecordingRequestDeps,
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

  // Capture incidentCommunityId before the transaction returns
  let incidentCommunityId: string = "";

  const result = await recordingRequestRepository.runInTransaction(async (tx) => {
    // 1. Validate actor can request recording (incident/camera/community checks + membership + role)
    const { incident, camera } = await ensureCanRequestRecording({
      client: tx,
      actor: input.actor,
      incidentId,
      cameraId,
    });

    incidentCommunityId = incident.communityId;

    // 2. Create recording request
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

    // 3. Audit
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

  // Emit realtime event (best-effort, fuera de la transacción)
  // Audience: DM al owner de la cámara
  const emit = emitFn ?? emitRealtimeEvent;
  await emit({
    type: "recording-request.created",
    communityId: incidentCommunityId,
    audience: { roomKeys: [`user:${result.recordingRequest.ownerId}`], userIds: [] },
    payload: {
      requestId: result.recordingRequest.id,
      incidentId: result.recordingRequest.incidentId,
      cameraId: result.recordingRequest.cameraId,
      ownerId: result.recordingRequest.ownerId,
      requesterId: result.recordingRequest.requestedById,
      communityId: incidentCommunityId,
      startTime: result.recordingRequest.startTime.toISOString(),
      endTime: result.recordingRequest.endTime.toISOString(),
      createdAt: result.recordingRequest.createdAt.toISOString(),
    },
  });

  return result;
}
