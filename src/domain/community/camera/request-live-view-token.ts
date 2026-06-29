import { AuditAction } from "@/generated/prisma/enums";
import { CommunityInvariantError } from "@/domain/community/errors";
import type { CameraRepository } from "./camera-repository";
import type { LiveStreamTokenIssuer } from "./live-stream-token-issuer";
import { ensureActiveMemberWithLiveAccess } from "@/domain/community/policies";

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
    // 1. Validate actor has live view access (camera ACTIVE + community ACTIVE + member ACTIVE + permission/schedule)
    const { member } = await ensureActiveMemberWithLiveAccess({
      client: tx,
      actor: { id: actorId },
      cameraId,
    });

    // 2. Issue token via the adapter
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    const issued = await liveStreamTokenIssuer.issue({
      cameraId,
      userId: actorId,
      expiresAt,
    });

    // 3. Audit
    await tx.createAuditLog({
      communityId: member.communityId,
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
