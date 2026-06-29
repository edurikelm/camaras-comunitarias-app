import {
  AuditAction,
  CameraStatus,
  CommunityMemberRole,
} from "@/generated/prisma/enums";
import {
  CommunityInvariantError,
} from "@/domain/community/errors";
import type { CameraRepository } from "./camera-repository";
import { isValidHHMM } from "./schedule";
import { isUuid } from "@/domain/shared/validators";
import { ensureCanSetPermission } from "@/domain/community/policies";

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
    if (!isUuid(input.permission.userId.trim())) {
      throw new CommunityInvariantError("userId must be a valid UUID");
    }
  }

  // Validate booleans are present (TypeScript enforces at compile time)

  // Validate schedule format and ordering
  const scheduleStart = input.permission.scheduleStart?.trim() || null;
  const scheduleEnd = input.permission.scheduleEnd?.trim() || null;

  if (scheduleStart && !isValidHHMM(scheduleStart)) {
    throw new CommunityInvariantError(
      "scheduleStart must be in HH:MM format",
    );
  }
  if (scheduleEnd && !isValidHHMM(scheduleEnd)) {
    throw new CommunityInvariantError(
      "scheduleEnd must be in HH:MM format",
    );
  }
  if (scheduleStart && scheduleEnd && scheduleStart === scheduleEnd) {
    throw new CommunityInvariantError(
      "scheduleStart and scheduleEnd must differ (use start > end for overnight ranges)",
    );
  }

  return cameraRepository.runInTransaction(async (tx) => {
    // 1. Validate actor can set permission (community ACTIVE + member active + camera exists/ACTIVE/owner)
    const { camera } = await ensureCanSetPermission({
      client: tx,
      actor: input.actor,
      cameraId,
      communityId,
    });

    // 2. Execute upsert
    const permission = await tx.upsertCameraPermission(cameraId, {
      roleAllowed: hasRole ? (input.permission.role ?? null) : null,
      userIdAllowed: hasUserId ? (input.permission.userId ?? null) : null,
      canViewLive: input.permission.canViewLive,
      canRequestRecordings: input.permission.canRequestRecordings,
      scheduleStart,
      scheduleEnd,
    });

    // 3. Audit
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
