/**
 * Authorization policy for approving a community member.
 *
 * Rule (CONTEXT.md §Membership Rules):
 *   Only an ACTIVE ADMIN can approve members.
 *
 * Errors:
 *   - CommunityNotFoundError("Community not found")
 *   - CommunityInvariantError("Community is not active")
 *   - CommunityAuthorizationError("Only an ACTIVE ADMIN can approve members")
 *   - CommunityNotFoundError("Member not found")
 *   - CommunityInvariantError("Member does not belong to this community")
 *   - CommunityInvariantError("Only PENDING members can be approved")
 *
 * Returns the target member record on success.
 */

import type { CommunityUnitOfWork } from "@/domain/community/community-repository";
import type { CommunityMemberRecord } from "@/domain/community/community-repository";
import {
  CommunityAuthorizationError,
  CommunityInvariantError,
  CommunityNotFoundError,
} from "@/domain/community/errors";
import { ensureActiveCommunity } from "../_helpers";

export type EnsureCanApproveMemberOptions = {
  client: CommunityUnitOfWork;
  actor: { id: string };
  communityId: string;
  memberId: string;
};

export type EnsureCanApproveMemberResult = {
  targetMember: CommunityMemberRecord;
};

/**
 * Validates the actor (ACTIVE ADMIN) can approve the target member.
 * Also validates the target member exists, is PENDING, and belongs to the community.
 * Returns the validated target member record.
 */
export async function ensureCanApproveMember({
  client,
  actor,
  communityId,
  memberId,
}: EnsureCanApproveMemberOptions): Promise<EnsureCanApproveMemberResult> {
  await ensureActiveCommunity(client, communityId);

  const actorMember = await client.findActiveAdminMember(communityId, actor.id);
  if (!actorMember) {
    throw new CommunityAuthorizationError(
      "Only an ACTIVE ADMIN can approve members",
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
  if (targetMember.status !== "PENDING") {
    throw new CommunityInvariantError("Only PENDING members can be approved");
  }

  return { targetMember };
}
