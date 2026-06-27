import { AuditAction, CommunityStatus } from "@/generated/prisma/enums";
import {
  CommunityAuthorizationError,
  CommunityInvariantError,
} from "@/domain/community/errors";
import type {
  CommunityMembershipRepository,
  CommunityUnitOfWork,
} from "@/domain/community/community-repository";
import { generateInviteCode, hashInviteCode } from "@/lib/crypto";

// ---------------------------------------------------------------------------
// Input
// ---------------------------------------------------------------------------

export type CreateInvitationInput = {
  actor: {
    id: string;
  };
  communityId: string;
};

// ---------------------------------------------------------------------------
// Result
// ---------------------------------------------------------------------------

export type CreateInvitationResult = {
  plainCode: string;
  invitation: {
    id: string;
    communityId: string;
    createdAt: Date;
  };
};

// ---------------------------------------------------------------------------
// Deps
// ---------------------------------------------------------------------------

export type CreateInvitationDeps = {
  repository: CommunityMembershipRepository;
};

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export async function createCommunityInvitation(
  input: CreateInvitationInput,
  { repository }: CreateInvitationDeps,
): Promise<CreateInvitationResult> {
  const communityId = input.communityId.trim();
  if (!communityId) {
    throw new CommunityInvariantError("communityId is required");
  }

  return repository.runInTransaction(async (tx: CommunityUnitOfWork) => {
    // 1. Validate actor is ACTIVE ADMIN of this community
    const actorMember = await tx.findActiveAdminMember(
      communityId,
      input.actor.id,
    );
    if (!actorMember) {
      throw new CommunityAuthorizationError(
        "Only an ACTIVE ADMIN can create invitations",
      );
    }

    // 2. Validate community exists and is ACTIVE
    const community = await tx.findCommunityById(communityId);
    if (!community) {
      throw new CommunityInvariantError("Community not found");
    }
    if (community.status !== CommunityStatus.ACTIVE) {
      throw new CommunityInvariantError("Community is not active");
    }

    // 3. Generate code and hash
    const plainCode = generateInviteCode();
    const codeHash = hashInviteCode(plainCode);
    const expiresAt = null; // MVP: no expiry by default

    // 4. Persist invitation
    const invitation = await tx.createCommunityInvitation({
      communityId,
      codeHash,
      createdById: input.actor.id,
      expiresAt,
    });

    // 5. Audit
    await tx.createAuditLog({
      communityId,
      actorId: input.actor.id,
      action: AuditAction.INVITATION_CREATED,
      entityType: "CommunityInvitation",
      entityId: invitation.id,
      metadata: {
        communityId,
      },
    });

    return {
      plainCode,
      invitation: {
        id: invitation.id,
        communityId: invitation.communityId,
        createdAt: invitation.createdAt,
      },
    };
  });
}
