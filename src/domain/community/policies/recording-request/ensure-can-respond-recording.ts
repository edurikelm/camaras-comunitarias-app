/**
 * Authorization policy for responding to a recording request.
 *
 * Rule (CONTEXT.md §Recording Request Rules):
 *   Only the camera owner can respond to a recording request.
 *
 * The service already has the RecordingRequestRecord loaded (Pattern B).
 * This policy checks: camera existence (→ 404), incident existence (→ 404),
 * and camera ownership (→ 403).
 *
 * Errors:
 *   - CommunityNotFoundError("Camera not found")
 *     (thrown when findCameraById returns null — verbatim from respond-recording-request.ts:70)
 *   - CommunityNotFoundError("Incident not found for recording request")
 *     (thrown when findIncidentById returns null — verbatim from respond-recording-request.ts:88)
 *   - CommunityAuthorizationError("Only the camera owner can respond to a recording request")
 *     (thrown when actor is not the camera owner)
 *
 * Returns the camera and incident records so the service can verify
 * their status without redundant lookups.
 */

import type { RecordingRequestRepository } from "@/domain/community/recording/recording-request-repository";
import type { RecordingRequestRecord } from "@/domain/community/recording/recording-request-repository";
import type { CameraLookupRecord } from "@/domain/community/recording/recording-request-repository";
import type { IncidentLookupRecord } from "@/domain/community/recording/recording-request-repository";
import type { MembershipLookupsPort } from "@/domain/community/membership/membership-lookups";
import {
  CommunityAuthorizationError,
  CommunityNotFoundError,
} from "@/domain/community/errors";

export type EnsureCanRespondRecordingOptions = {
  client: MembershipLookupsPort &
    Pick<RecordingRequestRepository, "findCameraById" | "findIncidentById">;
  actor: { id: string };
  request: RecordingRequestRecord;
};

export type EnsureCanRespondRecordingResult = {
  camera: CameraLookupRecord;
  incident: IncidentLookupRecord;
};

/**
 * Validates the actor (camera owner) can respond to the given recording request.
 * The request must already be loaded by the caller.
 * Throws CommunityAuthorizationError if the actor is not the camera owner.
 * Returns camera and incident records on success.
 */
export async function ensureCanRespondRecording({
  client,
  actor,
  request,
}: EnsureCanRespondRecordingOptions): Promise<EnsureCanRespondRecordingResult> {
  const camera = await client.findCameraById(request.cameraId);
  if (!camera) {
    // Camera non-existence → 404 (verbatim from respond-recording-request.ts:70)
    throw new CommunityNotFoundError("Camera not found");
  }

  if (camera.ownerId !== actor.id) {
    throw new CommunityAuthorizationError(
      "Only the camera owner can respond to a recording request",
    );
  }

  const incident = await client.findIncidentById(request.incidentId);
  if (!incident) {
    // Incident non-existence → 404 (verbatim from respond-recording-request.ts:88)
    throw new CommunityNotFoundError("Incident not found for recording request");
  }

  return { camera, incident };
}
