import {
  AuditAction,
  CameraStatus,
  CommunityMemberRole,
} from "@/generated/prisma/enums";
import {
  CommunityAuthorizationError,
  CommunityInvariantError,
} from "@/domain/community/errors";
import type { CameraRepository } from "./camera-repository";

// ---------------------------------------------------------------------------
// Input
// ---------------------------------------------------------------------------

const VALID_ROLES: ReadonlySet<string> = new Set(
  Object.values(CommunityMemberRole),
);

export type SetCameraPermissionInput = {
  actor: { id: string };
  communityId: string;
  cameraId: string;
  permission: {
    role?: CommunityMemberRole;
    userId?: string;
    canViewLive: boolean;
    canRequestRecordings: boolean;
    scheduleStart?: string;
    scheduleEnd?: string;
  };
};

// ---------------------------------------------------------------------------
// Result
// ---------------------------------------------------------------------------

export type SetCameraPermissionResult = {
  permission: {
    id: string;
    cameraId: string;
    roleAllowed: CommunityMemberRole | null;
    userIdAllowed: string | null;
    canViewLive: boolean;
    canRequestRecordings: boolean;
    scheduleStart: string | null;
    scheduleEnd: string | null;
  };
};

// ---------------------------------------------------------------------------
// Deps
// ---------------------------------------------------------------------------

export type SetCameraPermissionDeps = {
  cameraRepository: CameraRepository;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const HH_MM_REGEX = /^([01]\d|2[0-3]):([0-5]\d)$/;

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export async function setCameraPermission(
  input: SetCameraPermissionInput,
  { cameraRepository }: SetCameraPermissionDeps,
): Promise<SetCameraPermissionResult> {
  const communityId = input.communityId.trim();
  if (!communityId) {
    throw new CommunityInvariantError("communityId is required");
  }

  const cameraId = input.cameraId.trim();
  if (!cameraId) {
    throw new CommunityInvariantError("cameraId is required");
  }

  // Validate exactly one of role or userId is present
  const hasRole = input.permission.role !== undefined;
  const hasUserId = input.permission.userId !== undefined;
  if (!hasRole && !hasUserId) {
    throw new CommunityInvariantError(
      "Either role or userId must be specified",
    );
  }
  if (hasRole && hasUserId) {
    throw new CommunityInvariantError(
      "Cannot specify both role and userId",
    );
  }

  // Validate role is a valid enum value at runtime
  if (hasRole && input.permission.role && !VALID_ROLES.has(input.permission.role)) {
    throw new CommunityInvariantError("Invalid role");
  }

  // Optionally validate userId is a UUID format if present
  if (hasUserId && input.permission.userId) {
    const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!UUID_REGEX.test(input.permission.userId.trim())) {
      throw new CommunityInvariantError("userId must be a valid UUID");
    }
  }

  // Validate booleans are present (TypeScript enforces at compile time)

  // Validate schedule format and ordering
  const scheduleStart = input.permission.scheduleStart?.trim() || null;
  const scheduleEnd = input.permission.scheduleEnd?.trim() || null;

  if (scheduleStart && !HH_MM_REGEX.test(scheduleStart)) {
    throw new CommunityInvariantError(
      "scheduleStart must be in HH:MM format",
    );
  }
  if (scheduleEnd && !HH_MM_REGEX.test(scheduleEnd)) {
    throw new CommunityInvariantError(
      "scheduleEnd must be in HH:MM format",
    );
  }
  if (scheduleStart && scheduleEnd && scheduleEnd <= scheduleStart) {
    throw new CommunityInvariantError(
      "scheduleEnd must be greater than scheduleStart",
    );
  }

  return cameraRepository.runInTransaction(async (tx) => {
    // 1. Validate community exists and is ACTIVE
    const community = await tx.findCommunityById(communityId);
    if (!community) {
      throw new CommunityInvariantError("Community not found");
    }
    if (community.status !== "ACTIVE") {
      throw new CommunityInvariantError("Community is not active");
    }

    // 2. Validate actor is an ACTIVE member of the community
    const actorMember =
      (await tx.findActiveNeighborOrGuardMember(
        communityId,
        input.actor.id,
      )) ??
      (await tx.findActiveAdminMember(communityId, input.actor.id));
    if (!actorMember) {
      throw new CommunityAuthorizationError(
        "Only an ACTIVE member of the community can set camera permissions",
      );
    }

    // 3. Validate camera exists and belongs to this community
    const camera = await tx.findCameraById(cameraId);
    if (!camera) {
      throw new CommunityInvariantError("Camera not found");
    }
    if (camera.communityId !== communityId) {
      throw new CommunityInvariantError(
        "Camera does not belong to this community",
      );
    }

    // 4. Validate camera is ACTIVE
    if (camera.status !== CameraStatus.ACTIVE) {
      throw new CommunityInvariantError(
        "Camera must be ACTIVE to configure permissions",
      );
    }

    // 5. Validate actor is the camera owner
    if (camera.ownerId !== input.actor.id) {
      throw new CommunityAuthorizationError(
        "Only the camera owner can set permissions",
      );
    }

    // 6. Execute upsert
    const permission = await tx.upsertCameraPermission(cameraId, {
      roleAllowed: hasRole ? (input.permission.role ?? null) : null,
      userIdAllowed: hasUserId ? (input.permission.userId ?? null) : null,
      canViewLive: input.permission.canViewLive,
      canRequestRecordings: input.permission.canRequestRecordings,
      scheduleStart,
      scheduleEnd,
    });

    // 7. Audit
    await tx.createAuditLog({
      communityId,
      actorId: input.actor.id,
      action: AuditAction.CAMERA_PERMISSION_CHANGED,
      entityType: "CameraPermission",
      entityId: permission.id,
      metadata: {
        cameraId,
        roleAllowed: permission.roleAllowed,
        userIdAllowed: permission.userIdAllowed,
        canViewLive: permission.canViewLive,
        canRequestRecordings: permission.canRequestRecordings,
        hasSchedule: !!scheduleStart || !!scheduleEnd,
      },
    });

    return { permission };
  });
}
