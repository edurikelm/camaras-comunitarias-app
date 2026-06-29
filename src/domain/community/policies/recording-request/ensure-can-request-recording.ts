/**
 * Authorization policy for creating a recording request.
 *
 * Rule (CONTEXT.md §Recording Request Rules):
 *   Only the incident creator, ADMIN, or GUARD can request recordings.
 *
 * Errors:
 *   - CommunityNotFoundError("Incident not found")
 *   - CommunityInvariantError("Cannot request recordings for a closed incident")
 *   - CommunityNotFoundError("Community not found")
 *   - CommunityInvariantError("Community is not active; recording requests are disabled")
 *   - CommunityNotFoundError("Camera not found")
 *   - CommunityInvariantError("Camera does not belong to the incident's community")
 *   - CommunityInvariantError("Camera is not active")
 *   - CommunityAuthorizationError("Not an active member of this community")
 *   - CommunityAuthorizationError("Only the incident creator, ADMIN, or GUARD can request recordings")
 *
 * Returns the incident, camera, and member records so the caller avoids
 * redundant lookups (Pattern A from ADR-0016 §3).
 */

import type { RecordingRequestRepository } from "@/domain/community/recording/recording-request-repository";
import type { IncidentLookupRecord } from "@/domain/community/recording/recording-request-repository";
import type { CameraLookupRecord } from "@/domain/community/recording/recording-request-repository";
import type { MembershipLookupsPort } from "@/domain/community/membership/membership-lookups";
import type { MemberLookupRecord } from "@/domain/community/membership/membership-lookups";
import { IncidentStatus } from "@/generated/prisma/enums";
import {
  CommunityAuthorizationError,
  CommunityInvariantError,
  CommunityNotFoundError,
} from "@/domain/community/errors";
import { findAnyActiveMember } from "../_helpers";

export type EnsureCanRequestRecordingOptions = {
  client: MembershipLookupsPort &
    Pick<
      RecordingRequestRepository,
      "findIncidentById" | "findCameraById"
    >;
  actor: { id: string };
  incidentId: string;
  cameraId: string;
};

export type EnsureCanRequestRecordingResult = {
  incident: IncidentLookupRecord;
  camera: CameraLookupRecord;
  member: MemberLookupRecord;
};

/**
 * Validates the actor can request recordings for the given incident and camera.
 * Returns incident, camera, and member records on success.
 */
export async function ensureCanRequestRecording({
  client,
  actor,
  incidentId,
  cameraId,
}: EnsureCanRequestRecordingOptions): Promise<EnsureCanRequestRecordingResult> {
  const incident = await client.findIncidentById(incidentId);
  if (!incident) {
    throw new CommunityNotFoundError("Incident not found");
  }
  if (incident.status === IncidentStatus.CLOSED) {
    throw new CommunityInvariantError(
      "Cannot request recordings for a closed incident",
    );
  }

  const community = await client.findCommunityById(incident.communityId);
  if (!community) {
    throw new CommunityNotFoundError("Community not found");
  }
  if (community.status !== "ACTIVE") {
    throw new CommunityInvariantError(
      "Community is not active; recording requests are disabled",
    );
  }

  const camera = await client.findCameraById(cameraId);
  if (!camera) {
    throw new CommunityNotFoundError("Camera not found");
  }
  if (camera.communityId !== incident.communityId) {
    throw new CommunityInvariantError(
      "Camera does not belong to the incident's community",
    );
  }
  if (camera.status !== "ACTIVE") {
    throw new CommunityInvariantError("Camera is not active");
  }

  const member = await findAnyActiveMember(client, incident.communityId, actor.id);
  if (!member) {
    throw new CommunityAuthorizationError(
      "Not an active member of this community",
    );
  }

  const isAdmin = member.role === "ADMIN";
  const isGuard = member.role === "GUARD";
  const isCreator = incident.createdById === actor.id;

  if (!isCreator && !isAdmin && !isGuard) {
    throw new CommunityAuthorizationError(
      "Only the incident creator, ADMIN, or GUARD can request recordings",
    );
  }

  return { incident, camera, member };
}
