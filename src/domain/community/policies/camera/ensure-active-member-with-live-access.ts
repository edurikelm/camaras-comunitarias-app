/**
 * Authorization policy for requesting a live view token.
 *
 * Rule (CONTEXT.md §Live View Rules):
 *   Only ACTIVE community members with permission (admin bypass, or permission+schedule)
 *   can view a camera's live stream.
 *
 * Check order (observable HTTP response semantics):
 *   1. Camera ACTIVE → 400 if not
 *   2. Community ACTIVE → 404/400 if not
 *   3. Actor is ACTIVE member → 403 if not
 *   4. Admin OR permission-with-schedule → 403 if not
 *
 * Errors:
 *   - CommunityNotFoundError("Community not found")
 *   - CommunityInvariantError("Community is not active")
 *   - CommunityAuthorizationError("Only ACTIVE community members can view live streams")
 *   - CommunityAuthorizationError("You do not have permission to view this camera's live stream")
 *
 * Returns the validated member record on success so callers avoid a redundant lookup.
 */

import type { CameraRepository } from "@/domain/community/camera/camera-repository";
import type { MembershipLookupsPort } from "@/domain/community/membership/membership-lookups";
import type { MemberLookupRecord } from "@/domain/community/membership/membership-lookups";
import type { CommunityMemberRole } from "@/generated/prisma/enums";
import { CameraStatus } from "@/generated/prisma/enums";
import {
  CommunityAuthorizationError,
  CommunityInvariantError,
  CommunityNotFoundError,
} from "@/domain/community/errors";
import { ensureActiveCommunity, findAnyActiveMember } from "../_helpers";
import { isWithinSchedule, nowHHMM } from "@/domain/community/camera/schedule";

export type EnsureActiveMemberWithLiveAccessOptions = {
  client: MembershipLookupsPort &
    Pick<
      CameraRepository,
      "findCameraById" | "findPermissionByCameraAndRole" | "findPermissionByCameraAndUser"
    >;
  actor: { id: string };
  cameraId: string;
};

/**
 * Validates the actor can view the camera's live stream.
 * Returns the member record on success.
 */
export async function ensureActiveMemberWithLiveAccess({
  client,
  actor,
  cameraId,
}: EnsureActiveMemberWithLiveAccessOptions): Promise<{ member: MemberLookupRecord }> {
  const camera = await client.findCameraById(cameraId);
  if (!camera) {
    throw new CommunityNotFoundError("Camera not found");
  }
  if (camera.status !== CameraStatus.ACTIVE) {
    throw new CommunityInvariantError(
      "Camera is not available for live viewing",
    );
  }

  await ensureActiveCommunity(client, camera.communityId);

  const member = await findAnyActiveMember(client, camera.communityId, actor.id);
  if (!member) {
    throw new CommunityAuthorizationError(
      "Only ACTIVE community members can view live streams",
    );
  }

  const memberRole = member.role as CommunityMemberRole;
  const isAdmin = memberRole === "ADMIN";

  let hasViewPermission = isAdmin;

  if (!hasViewPermission) {
    const currentHHMM = nowHHMM();

    const rolePermission = await client.findPermissionByCameraAndRole(
      cameraId,
      memberRole,
    );
    if (
      rolePermission &&
      rolePermission.canViewLive &&
      isWithinSchedule(
        rolePermission.scheduleStart,
        rolePermission.scheduleEnd,
        currentHHMM,
      )
    ) {
      hasViewPermission = true;
    }

    if (!hasViewPermission) {
      const userPermission = await client.findPermissionByCameraAndUser(
        cameraId,
        actor.id,
      );
      if (
        userPermission &&
        userPermission.canViewLive &&
        isWithinSchedule(
          userPermission.scheduleStart,
          userPermission.scheduleEnd,
          currentHHMM,
        )
      ) {
        hasViewPermission = true;
      }
    }
  }

  if (!hasViewPermission) {
    throw new CommunityAuthorizationError(
      "You do not have permission to view this camera's live stream",
    );
  }

  return { member };
}
