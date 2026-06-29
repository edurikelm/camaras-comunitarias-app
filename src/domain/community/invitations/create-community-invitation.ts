import { AuditAction } from "@/generated/prisma/enums";
import {
  CommunityInvariantError,
} from "@/domain/community/errors";
import type {
  CommunityMembershipRepository,
  CommunityUnitOfWork,
} from "@/domain/community/community-repository";
import { generateInviteCode, hashInviteCode } from "@/lib/crypto";
import { ensureCanCreateInvitation } from "@/domain/community/policies";

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
    // 1. Validate actor can create invitation (community ACTIVE + actor ADMIN)
    await ensureCanCreateInvitation({
      client: tx,
      actor: input.actor,
      communityId,
    });

    // 2. Generate code and hash
    const plainCode = generateInviteCode();
    const codeHash = hashInviteCode(plainCode);
    const expiresAt = null; // MVP: no expiry by default

    // 3. Persist invitation
    const invitation = await tx.createCommunityInvitation({
      communityId,
      codeHash,
      createdById: input.actor.id,
      expiresAt,
    });

    // 4. Audit
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
