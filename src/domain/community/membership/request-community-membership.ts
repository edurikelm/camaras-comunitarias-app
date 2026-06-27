import {
  AuditAction,
  CommunityMemberRole,
  CommunityMemberStatus,
  CommunityStatus,
} from "@/generated/prisma/enums";
import { CommunityInvariantError } from "@/domain/community/errors";
import type {
  CommunityMembershipRepository,
  CommunityUnitOfWork,
} from "@/domain/community/community-repository";
import { hashInviteCode } from "@/lib/crypto";

// ---------------------------------------------------------------------------
// Input
// ---------------------------------------------------------------------------

export type RequestMembershipInput = {
  userId: string;
  code: string;
};

// ---------------------------------------------------------------------------
// Result
// ---------------------------------------------------------------------------

export type RequestMembershipResult = {
  member: {
    id: string;
    communityId: string;
    userId: string;
    role: CommunityMemberRole;
    status: CommunityMemberStatus;
  };
};

// ---------------------------------------------------------------------------
// Deps
// ---------------------------------------------------------------------------

export type RequestMembershipDeps = {
  repository: CommunityMembershipRepository;
  hashCode?: (code: string) => string;
};

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export async function requestCommunityMembership(
  input: RequestMembershipInput,
  { repository, hashCode = hashInviteCode }: RequestMembershipDeps,
): Promise<RequestMembershipResult> {
  const code = input.code.trim();
  if (!code) {
    throw new CommunityInvariantError("Invitation code is required");
  }

  const userId = input.userId.trim();
  if (!userId) {
    throw new CommunityInvariantError("userId is required");
  }

  return repository.runInTransaction(async (tx: CommunityUnitOfWork) => {
    // 1. Look up invitation by hashed code
    const codeHash = hashCode(code);
    const invitation = await tx.findInvitationByCodeHash(codeHash);

    if (!invitation) {
      throw new CommunityInvariantError("Invalid invitation code");
    }

    // 2. Validate invitation is not revoked/expired (optimistic pre-check)
    if (invitation.revokedAt) {
      throw new CommunityInvariantError("Invitation has been revoked");
    }
    if (invitation.expiresAt && new Date() > invitation.expiresAt) {
      throw new CommunityInvariantError("Invitation has expired");
    }

    // 3. Validate user is not already a member of any community (MVP: single-community constraint)
    const existingMember = await tx.findCommunityMemberByUserId(userId);
    if (existingMember) {
      throw new CommunityInvariantError(
        "User already belongs to a community in the MVP",
      );
    }

    // 4. Validate community exists and is ACTIVE
    const community = await tx.findCommunityById(invitation.communityId);
    if (!community) {
      throw new CommunityInvariantError("Community not found");
    }
    if (community.status !== CommunityStatus.ACTIVE) {
      throw new CommunityInvariantError(
        "Community is not accepting new members",
      );
    }

    // 5. Atomic claim: mark invitation as used (prevents double-redeem under concurrency)
    const claimed = await tx.markInvitationUsedIfAvailable(invitation.id);
    if (!claimed) {
      throw new CommunityInvariantError("Invitation has already been used");
    }

    // 6. Create PENDING member
    const member = await tx.createCommunityMember({
      userId,
      communityId: invitation.communityId,
      role: CommunityMemberRole.NEIGHBOR, // default, ADMIN will set final role on approval
      status: CommunityMemberStatus.PENDING,
    });

    // 7. Audit
    await tx.createAuditLog({
      communityId: invitation.communityId,
      actorId: userId,
      action: AuditAction.MEMBER_REQUESTED,
      entityType: "CommunityMember",
      entityId: member.id,
      metadata: {
        invitationId: invitation.id,
        communityId: invitation.communityId,
      },
    });

    return { member };
  });
}
