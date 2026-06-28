import { AuditAction, CameraStatus } from "@/generated/prisma/enums";
import type { CommunityMemberRole } from "@/generated/prisma/enums";
import {
  CommunityAuthorizationError,
  CommunityInvariantError,
  CommunityNotFoundError,
} from "@/domain/community/errors";
import type { CameraRepository } from "./camera-repository";
import { nowHHMM, isWithinSchedule } from "./schedule";
import type { LiveStreamTokenIssuer } from "./live-stream-token-issuer";

// ---------------------------------------------------------------------------
// Input / Result
// ---------------------------------------------------------------------------

export type RequestLiveViewTokenInput = {
  actor: { id: string };
  cameraId: string;
};

export type RequestLiveViewTokenResult = {
  streamUrl: string;
  token: string;
  expiresAt: Date;
};

// ---------------------------------------------------------------------------
// Deps
// ---------------------------------------------------------------------------

export type RequestLiveViewTokenDeps = {
  cameraRepository: CameraRepository;
  liveStreamTokenIssuer: LiveStreamTokenIssuer;
};

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export async function requestLiveViewToken(
  input: RequestLiveViewTokenInput,
  { cameraRepository, liveStreamTokenIssuer }: RequestLiveViewTokenDeps,
): Promise<RequestLiveViewTokenResult> {
  const cameraId = input.cameraId.trim();
  if (!cameraId) {
    throw new CommunityInvariantError("cameraId is required");
  }

  const actorId = input.actor.id.trim();
  if (!actorId) {
    throw new CommunityInvariantError("actorId is required");
  }

  return cameraRepository.runInTransaction(async (tx) => {
    // 1. Verify camera exists and is ACTIVE
    const camera = await tx.findCameraById(cameraId);
    if (!camera) {
      throw new CommunityNotFoundError("Camera not found");
    }
    if (camera.status !== CameraStatus.ACTIVE) {
      throw new CommunityInvariantError(
        "Camera is not available for live viewing",
      );
    }

    const communityId = camera.communityId;

    // 2. Verify community is ACTIVE
    const community = await tx.findCommunityById(communityId);
    if (!community) {
      throw new CommunityNotFoundError("Community not found");
    }
    if (community.status !== "ACTIVE") {
      throw new CommunityInvariantError("Community is not active");
    }

    // 3. Verify actor is an ACTIVE member of the community
    const member =
      (await tx.findActiveNeighborOrGuardMember(communityId, actorId)) ??
      (await tx.findActiveAdminMember(communityId, actorId));

    if (!member) {
      throw new CommunityAuthorizationError(
        "Only ACTIVE community members can view live streams",
      );
    }

    // 4. Check permission to view live
    const memberRole = member.role as CommunityMemberRole;
    const isAdmin = memberRole === "ADMIN";

    let hasViewPermission = isAdmin;

    if (!hasViewPermission) {
      const currentHHMM = nowHHMM();

      // Try permission by role first
      const rolePermission = await tx.findPermissionByCameraAndRole(
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

      // Try permission by user
      if (!hasViewPermission) {
        const userPermission = await tx.findPermissionByCameraAndUser(
          cameraId,
          actorId,
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

    // 5. Issue token via the adapter
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    const issued = await liveStreamTokenIssuer.issue({
      cameraId,
      userId: actorId,
      expiresAt,
    });

    // 6. Audit
    await tx.createAuditLog({
      communityId,
      actorId,
      action: AuditAction.CAMERA_LIVE_VIEWED,
      entityType: "Camera",
      entityId: cameraId,
      metadata: {
        tokenExpiresAt: expiresAt.toISOString(),
      },
    });

    return issued;
  });
}
