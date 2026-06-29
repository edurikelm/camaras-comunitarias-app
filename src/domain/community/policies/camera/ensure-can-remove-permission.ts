/**
 * Authorization policy for removing a camera permission.
 *
 * Rule (CONTEXT.md §Camera Permission Rules):
 *   Only the camera owner can remove permissions.
 *
 * Errors:
 *   - CommunityNotFoundError("Community not found")
 *   - CommunityInvariantError("Community is not active")
 *   - CommunityAuthorizationError("Only an ACTIVE member of the community can remove camera permissions")
 *   - CommunityNotFoundError("Camera not found")
 *   - CommunityInvariantError("Camera does not belong to this community")
 *   - CommunityInvariantError("Camera must be ACTIVE to configure permissions")
 *   - CommunityAuthorizationError("Only the camera owner can remove permissions")
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
import { ensureActiveCommunity, findAnyActiveMember } from "../_helpers";

export type EnsureCanRemovePermissionOptions = {
  client: MembershipLookupsPort & Pick<CameraRepository, "findCameraById">;
  actor: { id: string };
  cameraId: string;
  communityId: string;
};

/**
 * Validates the actor can remove the camera's permissions.
 * Checks:
 *  1. Community ACTIVE
 *  2. Actor is an ACTIVE member of the community
 *  3. Camera exists, belongs to community, and is ACTIVE
 *  4. Actor is the camera owner
 *
 * Returns the validated camera record so callers avoid a redundant lookup.
 */
export async function ensureCanRemovePermission({
  client,
  actor,
  cameraId,
  communityId,
}: EnsureCanRemovePermissionOptions): Promise<{ camera: CameraRecord }> {
  await ensureActiveCommunity(client, communityId);

  const member = await findAnyActiveMember(client, communityId, actor.id);
  if (!member) {
    throw new CommunityAuthorizationError(
      "Only an ACTIVE member of the community can remove camera permissions",
    );
  }

  const camera = await client.findCameraById(cameraId);
  if (!camera) {
    throw new CommunityNotFoundError("Camera not found");
  }
  if (camera.communityId !== communityId) {
    throw new CommunityInvariantError("Camera does not belong to this community");
  }
  if (camera.status !== CameraStatus.ACTIVE) {
    throw new CommunityInvariantError(
      "Camera must be ACTIVE to configure permissions",
    );
  }
  if (camera.ownerId !== actor.id) {
    throw new CommunityAuthorizationError(
      "Only the camera owner can remove permissions",
    );
  }

  return { camera };
}
