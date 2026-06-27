import { SignJWT } from "jose";
import { AuditAction, CameraStatus } from "@/generated/prisma/enums";
import type { CommunityMemberRole } from "@/generated/prisma/enums";
import {
  CommunityAuthorizationError,
  CommunityInvariantError,
} from "@/domain/community/errors";
import type { CameraRepository } from "./camera-repository";

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
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Returns the current time as an HH:MM string (24h format).
 */
function nowHHMM(now: Date = new Date()): string {
  const hh = now.getHours().toString().padStart(2, "0");
  const mm = now.getMinutes().toString().padStart(2, "0");
  return `${hh}:${mm}`;
}

/**
 * Checks whether `currentHHMM` falls within the optional schedule range.
 * Comparison is lexicographic (valid for HH:MM in 24h format).
 * When both start and end are absent the schedule is considered unrestricted.
 */
function isWithinSchedule(
  scheduleStart: string | null,
  scheduleEnd: string | null,
  currentHHMM: string,
): boolean {
  if (!scheduleStart && !scheduleEnd) return true;

  if (scheduleStart && scheduleEnd) {
    // Overnight schedule: start > end means the range crosses midnight.
    // e.g. "22:00"–"06:00" permits any time from 22:00 to 23:59 and 00:00 to 06:00.
    if (scheduleStart > scheduleEnd) {
      return currentHHMM >= scheduleStart || currentHHMM <= scheduleEnd;
    }
    // Normal same-day schedule: start <= end.
    return currentHHMM >= scheduleStart && currentHHMM <= scheduleEnd;
  }

  if (scheduleStart && !scheduleEnd) {
    // Only a lower bound — allow if current >= start.
    return currentHHMM >= scheduleStart;
  }

  // Only an upper bound — allow if current <= end.
  return currentHHMM <= scheduleEnd!;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export async function requestLiveViewToken(
  input: RequestLiveViewTokenInput,
  { cameraRepository }: RequestLiveViewTokenDeps,
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
      throw new CommunityInvariantError("Camera not found");
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
      throw new CommunityInvariantError("Community not found");
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
      // Try permission by role first
      const rolePermission = await tx.findPermissionByCameraAndRole(
        cameraId,
        memberRole,
      );

      if (rolePermission && rolePermission.canViewLive) {
        const currentHHMM = nowHHMM();
        if (isWithinSchedule(rolePermission.scheduleStart, rolePermission.scheduleEnd, currentHHMM)) {
          hasViewPermission = true;
        }
      }
    }

    if (!hasViewPermission) {
      // Try permission by user
      const userPermission = await tx.findPermissionByCameraAndUser(
        cameraId,
        actorId,
      );

      if (userPermission && userPermission.canViewLive) {
        const currentHHMM = nowHHMM();
        if (isWithinSchedule(userPermission.scheduleStart, userPermission.scheduleEnd, currentHHMM)) {
          hasViewPermission = true;
        }
      }
    }

    if (!hasViewPermission) {
      throw new CommunityAuthorizationError(
        "You do not have permission to view this camera's live stream",
      );
    }

    // 5. Generate JWT
    const streamSecret = process.env.CAMERA_STREAM_SECRET;
    if (!streamSecret) {
      throw new Error(
        "CAMERA_STREAM_SECRET environment variable is not configured",
      );
    }

    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    const secret = new TextEncoder().encode(streamSecret);
    const jwt = await new SignJWT({ cameraId, userId: actorId })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime("1h")
      .sign(secret);

    // 6. Build stream URL
    const mediaServerUrl = process.env.NEXT_PUBLIC_MEDIA_SERVER_URL;
    if (!mediaServerUrl) {
      throw new Error(
        "NEXT_PUBLIC_MEDIA_SERVER_URL environment variable is not configured",
      );
    }

    const streamUrl = `${mediaServerUrl}/stream/${cameraId}?token=${jwt}`;

    // 7. Audit
    await tx.createAuditLog({
      communityId,
      actorId: actorId,
      action: AuditAction.CAMERA_LIVE_VIEWED,
      entityType: "Camera",
      entityId: cameraId,
      metadata: {
        tokenExpiresAt: expiresAt.toISOString(),
      },
    });

    return {
      streamUrl,
      token: jwt,
      expiresAt,
    };
  });
}
