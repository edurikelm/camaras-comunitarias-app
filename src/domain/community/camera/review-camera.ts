import { AuditAction, CameraStatus } from "@/generated/prisma/enums";
import {
  CommunityAuthorizationError,
  CommunityInvariantError,
} from "@/domain/community/errors";
import type { CameraRepository } from "./camera-repository";

// ---------------------------------------------------------------------------
// Input
// ---------------------------------------------------------------------------

export type ReviewCameraInput = {
  actor: { id: string };
  communityId: string;
  cameraId: string;
  action: "APPROVE" | "REJECT";
  reviewNote?: string;
};

// ---------------------------------------------------------------------------
// Result
// ---------------------------------------------------------------------------

export type ReviewCameraResult = {
  camera: {
    id: string;
    status: CameraStatus;
    reviewNote: string | null;
  };
};

// ---------------------------------------------------------------------------
// Deps
// ---------------------------------------------------------------------------

export type ReviewCameraDeps = {
  cameraRepository: CameraRepository;
};

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export async function reviewCamera(
  input: ReviewCameraInput,
  { cameraRepository }: ReviewCameraDeps,
): Promise<ReviewCameraResult> {
  const communityId = input.communityId.trim();
  if (!communityId) {
    throw new CommunityInvariantError("communityId is required");
  }

  const cameraId = input.cameraId.trim();
  if (!cameraId) {
    throw new CommunityInvariantError("cameraId is required");
  }

  if (input.action !== "APPROVE" && input.action !== "REJECT") {
    throw new CommunityInvariantError(
      "Action must be APPROVE or REJECT",
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

    // 2. Validate actor is ACTIVE ADMIN of the community
    const actorMember = await tx.findActiveAdminMember(
      communityId,
      input.actor.id,
    );
    if (!actorMember) {
      throw new CommunityAuthorizationError(
        "Only an ACTIVE ADMIN can review cameras",
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

    // 4. Validate camera is in PENDING_REVIEW
    if (camera.status !== CameraStatus.PENDING_REVIEW) {
      throw new CommunityInvariantError(
        "Camera is not pending review",
      );
    }

    // 4a. Prevent ADMIN from reviewing their own camera
    if (camera.ownerId === input.actor.id) {
      throw new CommunityAuthorizationError(
        "An ADMIN cannot review their own camera",
      );
    }

    // 5. Apply action
    const newStatus =
      input.action === "APPROVE"
        ? CameraStatus.ACTIVE
        : CameraStatus.REJECTED;

    const newTechnicalStatus =
      input.action === "APPROVE" ? "configurada" : null;

    const reviewNote = input.reviewNote?.trim() || null;

    const updatedCamera = await tx.updateCamera(cameraId, {
      status: newStatus,
      technicalStatus: newTechnicalStatus,
      reviewNote,
    });

    // 6. Audit
    await tx.createAuditLog({
      communityId,
      actorId: input.actor.id,
      action: AuditAction.CAMERA_REVIEWED,
      entityType: "Camera",
      entityId: cameraId,
      metadata: {
        communityId,
        previousStatus: camera.status,
        newStatus,
        action: input.action,
      },
    });

    return {
      camera: {
        id: updatedCamera.id,
        status: updatedCamera.status,
        reviewNote: updatedCamera.reviewNote,
      },
    };
  });
}
