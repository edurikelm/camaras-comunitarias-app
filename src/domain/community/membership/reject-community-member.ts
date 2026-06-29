import {
  AuditAction,
  CommunityMemberStatus,
} from "@/generated/prisma/enums";
import {
  CommunityInvariantError,
} from "@/domain/community/errors";
import type {
  CommunityMembershipRepository,
  CommunityUnitOfWork,
} from "@/domain/community/community-repository";
import { ensureCanRejectMember } from "@/domain/community/policies";

// ---------------------------------------------------------------------------
// Input
// ---------------------------------------------------------------------------

export type RejectMemberInput = {
  actor: {
    id: string;
  };
  communityId: string;
  memberId: string;
  reason?: string;
};

// ---------------------------------------------------------------------------
// Result
// ---------------------------------------------------------------------------

export type RejectMemberResult = {
  member: {
    id: string;
    userId: string;
    communityId: string;
    status: CommunityMemberStatus;
  };
};

// ---------------------------------------------------------------------------
// Deps
// ---------------------------------------------------------------------------

export type RejectMemberDeps = {
  repository: CommunityMembershipRepository;
};

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export async function rejectCommunityMember(
  input: RejectMemberInput,
  { repository }: RejectMemberDeps,
): Promise<RejectMemberResult> {
  const communityId = input.communityId.trim();
  if (!communityId) {
    throw new CommunityInvariantError("communityId is required");
  }

  const memberId = input.memberId.trim();
  if (!memberId) {
    throw new CommunityInvariantError("memberId is required");
  }

  return repository.runInTransaction(async (tx: CommunityUnitOfWork) => {
    // 1. Validate actor can reject member (community ACTIVE + actor ADMIN + target member exists/PENDING/belongs)
    const { targetMember } = await ensureCanRejectMember({
      client: tx,
      actor: input.actor,
      communityId,
      memberId,
    });

    // 2. Block the member
    const updatedMember = await tx.updateCommunityMember(memberId, {
      status: CommunityMemberStatus.BLOCKED,
    });

    // 3. Audit
    await tx.createAuditLog({
      communityId,
      actorId: input.actor.id,
      action: AuditAction.MEMBER_BLOCKED,
      entityType: "CommunityMember",
      entityId: memberId,
      metadata: {
        rejectedByUserId: input.actor.id,
        previousStatus: targetMember.status,
        reason: input.reason ?? null,
      },
    });

    return { member: updatedMember };
  });
}
