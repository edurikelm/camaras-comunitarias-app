import { AuditAction, CameraStatus } from "@/generated/prisma/enums";
import {
  CommunityAuthorizationError,
  CommunityInvariantError,
  CommunityNotFoundError,
} from "@/domain/community/errors";
import type { CameraRepository } from "./camera-repository";
import { isRtspUrl } from "@/domain/shared/validators";

// ---------------------------------------------------------------------------
// Input
// ---------------------------------------------------------------------------

export type RegisterCameraInput = {
  actor: { id: string };
  communityId: string;
  name: string;
  description?: string;
  approximateLocation?: string;
  sectorId?: string;
  rtspUrl: string;
  streamKey?: string;
};

// ---------------------------------------------------------------------------
// Result
// ---------------------------------------------------------------------------

export type RegisterCameraResult = {
  camera: {
    id: string;
    communityId: string;
    ownerId: string;
    name: string;
    status: CameraStatus;
  };
};

// ---------------------------------------------------------------------------
// Deps
// ---------------------------------------------------------------------------

export type RegisterCameraDeps = {
  cameraRepository: CameraRepository;
};

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export async function registerCommunityCamera(
  input: RegisterCameraInput,
  { cameraRepository }: RegisterCameraDeps,
): Promise<RegisterCameraResult> {
  const communityId = input.communityId.trim();
  if (!communityId) {
    throw new CommunityInvariantError("communityId is required");
  }

  const name = input.name.trim();
  if (!name) {
    throw new CommunityInvariantError("Camera name is required");
  }

  const rtspUrl = input.rtspUrl.trim();
  if (!isRtspUrl(rtspUrl)) {
    throw new CommunityInvariantError(
      "A valid RTSP URL starting with rtsp:// is required",
    );
  }

  if (input.streamKey !== undefined && input.streamKey.trim().length < 8) {
    throw new CommunityInvariantError(
      "Stream key must be at least 8 characters",
    );
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

    // 2. Validate actor is ACTIVE member (NEIGHBOR, GUARD, or ADMIN)
    const actorMember =
      (await tx.findActiveNeighborOrGuardMember(communityId, input.actor.id)) ??
      (await tx.findActiveAdminMember(communityId, input.actor.id));
    if (!actorMember) {
      throw new CommunityAuthorizationError(
        "Only an ACTIVE NEIGHBOR, GUARD, or ADMIN can register a camera",
      );
    }

    // 3. If sectorId provided, verify it belongs to the community
    if (input.sectorId) {
      const sector = await tx.findSectorById(input.sectorId);
      if (!sector || sector.communityId !== communityId) {
        throw new CommunityInvariantError(
          "Sector does not belong to this community",
        );
      }
    }

    // 4. Create camera (repository handles encryption/hashing internally)
    const camera = await tx.createCamera({
      communityId,
      ownerId: input.actor.id,
      sectorId: input.sectorId ?? null,
      name,
      description: input.description?.trim() ?? null,
      approximateLocation: input.approximateLocation?.trim() ?? null,
      status: CameraStatus.PENDING_REVIEW,
      technicalStatus: "pendiente",
      rtspUrl,
      streamKey: input.streamKey ?? null,
    });

    // 5. Audit
    await tx.createAuditLog({
      communityId,
      actorId: input.actor.id,
      action: AuditAction.CAMERA_CREATED,
      entityType: "Camera",
      entityId: camera.id,
      metadata: { communityId, cameraName: name },
    });

    return {
      camera: {
        id: camera.id,
        communityId: camera.communityId,
        ownerId: camera.ownerId,
        name: camera.name,
        status: camera.status,
      },
    };
  });
}
