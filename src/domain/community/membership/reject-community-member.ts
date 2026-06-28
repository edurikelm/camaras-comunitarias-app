import {
  AuditAction,
  CommunityMemberStatus,
  CommunityStatus,
} from "@/generated/prisma/enums";
import {
  CommunityAuthorizationError,
  CommunityInvariantError,
  CommunityNotFoundError,
} from "@/domain/community/errors";
import type {
  CommunityMembershipRepository,
  CommunityUnitOfWork,
} from "@/domain/community/community-repository";

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
    // 1. Validate community exists and is ACTIVE
    const community = await tx.findCommunityById(communityId);
    if (!community) {
      throw new CommunityNotFoundError("Community not found");
    }
    if (community.status !== CommunityStatus.ACTIVE) {
      throw new CommunityInvariantError("Community is not active");
    }

    // 2. Validate actor is ACTIVE ADMIN of the community
    const actorMember = await tx.findActiveAdminMember(
      communityId,
      input.actor.id,
    );
    if (!actorMember) {
      throw new CommunityAuthorizationError(
        "Only an ACTIVE ADMIN can reject members",
      );
    }

    // 3. Validate target member exists and is PENDING in the same community
    const targetMember = await tx.findCommunityMemberById(memberId);
    if (!targetMember) {
      throw new CommunityNotFoundError("Member not found");
    }
    if (targetMember.communityId !== communityId) {
      throw new CommunityInvariantError(
        "Member does not belong to this community",
      );
    }
    if (targetMember.status !== CommunityMemberStatus.PENDING) {
      throw new CommunityInvariantError(
        "Only PENDING members can be rejected",
      );
    }

    // 4. Block the member
    const updatedMember = await tx.updateCommunityMember(memberId, {
      status: CommunityMemberStatus.BLOCKED,
    });

    // 5. Audit
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
