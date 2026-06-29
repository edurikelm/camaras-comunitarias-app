/**
 * Authorization policy for rejecting a community member.
 *
 * Rule (CONTEXT.md §Membership Rules):
 *   Only an ACTIVE ADMIN can reject members.
 *
 * Errors:
 *   - CommunityNotFoundError("Community not found")
 *   - CommunityInvariantError("Community is not active")
 *   - CommunityAuthorizationError("Only an ACTIVE ADMIN can reject members")
 *   - CommunityNotFoundError("Member not found")
 *   - CommunityInvariantError("Member does not belong to this community")
 *   - CommunityInvariantError("Only PENDING members can be rejected")
 *
 * Returns the target member record on success.
 */

import type { CommunityMembershipRepository } from "@/domain/community/community-repository";
import type { CommunityMemberRecord } from "@/domain/community/community-repository";
import { CommunityMemberStatus } from "@/generated/prisma/enums";
import {
  CommunityAuthorizationError,
  CommunityInvariantError,
  CommunityNotFoundError,
} from "@/domain/community/errors";
import { ensureActiveCommunity } from "../_helpers";

export type EnsureCanRejectMemberOptions = {
  client: CommunityMembershipRepository;
  actor: { id: string };
  communityId: string;
  memberId: string;
};

export type EnsureCanRejectMemberResult = {
  targetMember: CommunityMemberRecord;
};

/**
 * Validates the actor (ACTIVE ADMIN) can reject the target member.
 * Also validates the target member exists, is PENDING, and belongs to the community.
 * Returns the validated target member record.
 */
export async function ensureCanRejectMember({
  client,
  actor,
  communityId,
  memberId,
}: EnsureCanRejectMemberOptions): Promise<EnsureCanRejectMemberResult> {
  await ensureActiveCommunity(client, communityId);

  const actorMember = await client.findActiveAdminMember(communityId, actor.id);
  if (!actorMember) {
    throw new CommunityAuthorizationError(
      "Only an ACTIVE ADMIN can reject members",
    );
  }

  const targetMember = await client.findCommunityMemberById(memberId);
  if (!targetMember) {
    throw new CommunityNotFoundError("Member not found");
  }
  if (targetMember.communityId !== communityId) {
    throw new CommunityInvariantError(
      "Member does not belong to this community",
    );
  }
  if (targetMember.status !== CommunityMemberStatus.PENDING) {
    throw new CommunityInvariantError("Only PENDING members can be rejected");
  }

  return { targetMember };
}
