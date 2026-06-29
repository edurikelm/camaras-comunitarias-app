import {
  AuditAction,
  CommunityMemberRole,
  CommunityMemberStatus,
  CommunityStatus,
} from "@/generated/prisma/enums";
import {
  CommunityInvariantError,
} from "@/domain/community/errors";
import type {
  CommunityMembershipRepository,
  CommunityUnitOfWork,
} from "@/domain/community/community-repository";
import { ensureCanApproveMember } from "@/domain/community/policies";

// ---------------------------------------------------------------------------
// Input
// ---------------------------------------------------------------------------

export type ApproveMemberInput = {
  actor: {
    id: string;
  };
  communityId: string;
  memberId: string;
  role: CommunityMemberRole;
};

// ---------------------------------------------------------------------------
// Result
// ---------------------------------------------------------------------------

export type ApproveMemberResult = {
  member: {
    id: string;
    userId: string;
    communityId: string;
    role: CommunityMemberRole;
    status: CommunityMemberStatus;
  };
};

// ---------------------------------------------------------------------------
// Deps
// ---------------------------------------------------------------------------

export type ApproveMemberDeps = {
  repository: CommunityMembershipRepository;
};

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

const ALLOWED_APPROVAL_ROLES: CommunityMemberRole[] = [
  CommunityMemberRole.NEIGHBOR,
  CommunityMemberRole.GUARD,
];

export async function approveCommunityMember(
  input: ApproveMemberInput,
  { repository }: ApproveMemberDeps,
): Promise<ApproveMemberResult> {
  const communityId = input.communityId.trim();
  if (!communityId) {
    throw new CommunityInvariantError("communityId is required");
  }

  const memberId = input.memberId.trim();
  if (!memberId) {
    throw new CommunityInvariantError("memberId is required");
  }

  if (!ALLOWED_APPROVAL_ROLES.includes(input.role)) {
    throw new CommunityInvariantError(
      "Role must be NEIGHBOR or GUARD when approving a member",
    );
  }

  return repository.runInTransaction(async (tx: CommunityUnitOfWork) => {
    // 1. Validate actor can approve member (community ACTIVE + actor ADMIN + target member exists/PENDING/belongs)
    const { targetMember } = await ensureCanApproveMember({
      client: tx,
      actor: input.actor,
      communityId,
      memberId,
    });

    // 2. Activate and set role
    const updatedMember = await tx.updateCommunityMember(memberId, {
      status: CommunityMemberStatus.ACTIVE,
      role: input.role,
    });

    // 3. Audit
    await tx.createAuditLog({
      communityId,
      actorId: input.actor.id,
      action: AuditAction.MEMBER_APPROVED,
      entityType: "CommunityMember",
      entityId: memberId,
      metadata: {
        approvedByUserId: input.actor.id,
        previousRole: targetMember.role,
        assignedRole: input.role,
      },
    });

    return { member: updatedMember };
  });
}
