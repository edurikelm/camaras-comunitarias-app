import { AuditAction, CameraStatus } from "@/generated/prisma/enums";
import {
  CommunityInvariantError,
} from "@/domain/community/errors";
import type { CameraRepository } from "./camera-repository";
import { ensureCanReviewCamera } from "@/domain/community/policies";

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
    // 1. Validate actor can review this camera (community ACTIVE + actor is ADMIN + camera exists + self-review prevention)
    const { camera } = await ensureCanReviewCamera({
      client: tx,
      actor: input.actor,
      cameraId,
      communityId,
    });

    // 2. Validate camera is in PENDING_REVIEW (resource state invariant)
    if (camera.status !== CameraStatus.PENDING_REVIEW) {
      throw new CommunityInvariantError(
        "Camera is not pending review",
      );
    }

    // 3. Apply action
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

    // 4. Audit
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
