/**
 * Authorization policy for reviewing (approving/rejecting) a camera.
 *
 * Rule (CONTEXT.md §Camera Permission Rules):
 *   Only an ACTIVE ADMIN can review cameras. An ADMIN cannot review their own camera.
 *
 * Errors:
 *   - CommunityNotFoundError("Community not found")
 *   - CommunityInvariantError("Community is not active")
 *   - CommunityAuthorizationError("Only an ACTIVE ADMIN can review cameras")
 *   - CommunityNotFoundError("Camera not found")
 *   - CommunityInvariantError("Camera does not belong to this community")
 *   - CommunityInvariantError("Camera is not pending review")
 *   - CommunityAuthorizationError("An ADMIN cannot review their own camera")
 *
 * Returns the camera record on success so callers avoid a redundant lookup.
 */

import type { CameraRepository } from "@/domain/community/camera/camera-repository";
import type { MembershipLookupsPort } from "@/domain/community/membership/membership-lookups";
import type { CameraRecord } from "@/domain/community/camera/camera-repository";
import { CameraStatus } from "@/generated/prisma/enums";
import {
  CommunityAuthorizationError,
  CommunityInvariantError,
  CommunityNotFoundError,
} from "@/domain/community/errors";
import { ensureActiveCommunity } from "../_helpers";

export type EnsureCanReviewCameraOptions = {
  client: MembershipLookupsPort & Pick<CameraRepository, "findCameraById">;
  actor: { id: string };
  cameraId: string;
  communityId: string;
};

/**
 * Validates the actor can review the camera.
 * Throws in order: 404 (community) → 400 (community status) → 403 (not admin) →
 * 404 (camera) → 400 (camera wrong community) → 400 (camera not pending) → 403 (self-review).
 * Returns the validated camera record.
 */
export async function ensureCanReviewCamera({
  client,
  actor,
  cameraId,
  communityId,
}: EnsureCanReviewCameraOptions): Promise<{ camera: CameraRecord }> {
  await ensureActiveCommunity(client, communityId);

  const actorMember = await client.findActiveAdminMember(communityId, actor.id);
  if (!actorMember) {
    throw new CommunityAuthorizationError(
      "Only an ACTIVE ADMIN can review cameras",
    );
  }

  const camera = await client.findCameraById(cameraId);
  if (!camera) {
    throw new CommunityNotFoundError("Camera not found");
  }
  if (camera.communityId !== communityId) {
    throw new CommunityInvariantError("Camera does not belong to this community");
  }
  if (camera.status !== CameraStatus.PENDING_REVIEW) {
    throw new CommunityInvariantError("Camera is not pending review");
  }
  if (camera.ownerId === actor.id) {
    throw new CommunityAuthorizationError(
      "An ADMIN cannot review their own camera",
    );
  }

  return { camera };
}
