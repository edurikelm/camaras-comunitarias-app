import { AuditAction, CameraStatus } from "@/generated/prisma/enums";
import {
  CommunityAuthorizationError,
  CommunityInvariantError,
  CommunityNotFoundError,
} from "@/domain/community/errors";
import type { CameraRepository } from "./camera-repository";

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
    // 1. Validate community exists and is ACTIVE
    const community = await tx.findCommunityById(communityId);
    if (!community) {
      throw new CommunityNotFoundError("Community not found");
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
        "Only an ACTIVE member of the community can remove camera permissions",
      );
    }

    // 3. Validate camera exists, belongs to this community, and is ACTIVE
    const camera = await tx.findCameraById(cameraId);
    if (!camera) {
      throw new CommunityNotFoundError("Camera not found");
    }
    if (camera.communityId !== communityId) {
      throw new CommunityInvariantError(
        "Camera does not belong to this community",
      );
    }
    if (camera.status !== CameraStatus.ACTIVE) {
      throw new CommunityInvariantError(
        "Camera must be ACTIVE to remove permissions",
      );
    }

    // 4. Validate actor is the camera owner
    if (camera.ownerId !== input.actor.id) {
      throw new CommunityAuthorizationError(
        "Only the camera owner can remove permissions",
      );
    }

    // 5. Validate permission exists and belongs to this camera
    const permission = await tx.findPermissionById(permissionId);
    if (!permission) {
      throw new CommunityNotFoundError("Permission not found");
    }
    if (permission.cameraId !== cameraId) {
      throw new CommunityInvariantError(
        "Permission does not belong to this camera",
      );
    }

    // 6. Delete
    const deleted = await tx.deleteCameraPermission(permissionId);
    if (!deleted) {
      throw new CommunityNotFoundError("Permission not found");
    }

    // 7. Audit
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
