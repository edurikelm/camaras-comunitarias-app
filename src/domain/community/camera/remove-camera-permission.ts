import { AuditAction, CameraStatus } from "@/generated/prisma/enums";
import {
  CommunityInvariantError,
  CommunityNotFoundError,
} from "@/domain/community/errors";
import type { CameraRepository } from "./camera-repository";
import { ensureCanRemovePermission } from "@/domain/community/policies";

// ---------------------------------------------------------------------------
// Input
// ---------------------------------------------------------------------------

export type RemoveCameraPermissionInput = {
  actor: { id: string };
  communityId: string;
  cameraId: string;
  permissionId: string;
};

// ---------------------------------------------------------------------------
// Result
// ---------------------------------------------------------------------------

export type RemoveCameraPermissionResult = {
  deleted: boolean;
};

// ---------------------------------------------------------------------------
// Deps
// ---------------------------------------------------------------------------

export type RemoveCameraPermissionDeps = {
  cameraRepository: CameraRepository;
};

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export async function removeCameraPermission(
  input: RemoveCameraPermissionInput,
  { cameraRepository }: RemoveCameraPermissionDeps,
): Promise<RemoveCameraPermissionResult> {
  const communityId = input.communityId.trim();
  if (!communityId) {
    throw new CommunityInvariantError("communityId is required");
  }

  const cameraId = input.cameraId.trim();
  if (!cameraId) {
    throw new CommunityInvariantError("cameraId is required");
  }

  const permissionId = input.permissionId.trim();
  if (!permissionId) {
    throw new CommunityInvariantError("permissionId is required");
  }

  return cameraRepository.runInTransaction(async (tx) => {
    // 1. Validate actor can remove permission (community ACTIVE + member active + camera exists/ACTIVE/owner)
    const { camera } = await ensureCanRemovePermission({
      client: tx,
      actor: input.actor,
      cameraId,
      communityId,
    });

    // 2. Validate permission exists and belongs to this camera
    const permission = await tx.findPermissionById(permissionId);
    if (!permission) {
      throw new CommunityNotFoundError("Permission not found");
    }
    if (permission.cameraId !== cameraId) {
      throw new CommunityInvariantError(
        "Permission does not belong to this camera",
      );
    }

    // 3. Delete
    const deleted = await tx.deleteCameraPermission(permissionId);
    if (!deleted) {
      throw new CommunityNotFoundError("Permission not found");
    }

    // 4. Audit
    await tx.createAuditLog({
      communityId: camera.communityId,
      actorId: input.actor.id,
      action: AuditAction.CAMERA_PERMISSION_CHANGED,
      entityType: "CameraPermission",
      entityId: permissionId,
      metadata: {
        cameraId,
        roleAllowed: permission.roleAllowed,
        userIdAllowed: permission.userIdAllowed,
      },
    });

    return { deleted: true };
  });
}
