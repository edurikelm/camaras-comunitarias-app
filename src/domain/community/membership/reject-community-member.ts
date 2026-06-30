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
import { emitRealtimeEvent } from "@/lib/realtime/emit-realtime-event";

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
  emitRealtimeEvent?: typeof emitRealtimeEvent;
};

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export async function rejectCommunityMember(
  input: RejectMemberInput,
  { repository, emitRealtimeEvent: emitFn }: RejectMemberDeps,
): Promise<RejectMemberResult> {
  const communityId = input.communityId.trim();
  if (!communityId) {
    throw new CommunityInvariantError("communityId is required");
  }

  const memberId = input.memberId.trim();
  if (!memberId) {
    throw new CommunityInvariantError("memberId is required");
  }

  // Capture previousStatus before the transaction (targetMember.status is PENDING)
  let previousStatus: CommunityMemberStatus = CommunityMemberStatus.PENDING;
  const changedAt = new Date();

  const result = await repository.runInTransaction(async (tx: CommunityUnitOfWork) => {
    // 1. Validate actor can reject member (community ACTIVE + actor ADMIN + target member exists/PENDING/belongs)
    const { targetMember } = await ensureCanRejectMember({
      client: tx,
      actor: input.actor,
      communityId,
      memberId,
    });

    previousStatus = targetMember.status;

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

  // Emit realtime event (best-effort, fuera de la transacción)
  const emit = emitFn ?? emitRealtimeEvent;
  await emit({
    type: "community-member.status-changed",
    communityId,
    audience: { roomKeys: [`user:${result.member.userId}`], userIds: [] },
    payload: {
      userId: result.member.userId,
      communityId,
      previousStatus,
      newStatus: "BLOCKED",
      changedById: input.actor.id,
      changedAt: changedAt.toISOString(),
    },
  });

  return result;
}
