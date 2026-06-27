import {
  AuditAction,
  CommunityMemberRole,
  CommunityMemberStatus,
  CommunityStatus,
} from "@/generated/prisma/enums";
import {
  CommunityAuthorizationError,
  CommunityInvariantError,
} from "@/domain/community/errors";
import type {
  CommunityMembershipRepository,
  CommunityUnitOfWork,
} from "@/domain/community/community-repository";

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
    // 1. Validate community exists and is ACTIVE
    const community = await tx.findCommunityById(communityId);
    if (!community) {
      throw new CommunityInvariantError("Community not found");
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
        "Only an ACTIVE ADMIN can approve members",
      );
    }

    // 3. Validate target member exists and is PENDING in the same community
    const targetMember = await tx.findCommunityMemberById(memberId);
    if (!targetMember) {
      throw new CommunityInvariantError("Member not found");
    }
    if (targetMember.communityId !== communityId) {
      throw new CommunityInvariantError(
        "Member does not belong to this community",
      );
    }
    if (targetMember.status !== CommunityMemberStatus.PENDING) {
      throw new CommunityInvariantError(
        "Only PENDING members can be approved",
      );
    }

    // 4. Activate and set role
    const updatedMember = await tx.updateCommunityMember(memberId, {
      status: CommunityMemberStatus.ACTIVE,
      role: input.role,
    });

    // 5. Audit
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
