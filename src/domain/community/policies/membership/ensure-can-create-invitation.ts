/**
 * Authorization policy for creating a community invitation.
 *
 * Rule (CONTEXT.md §Membership Rules):
 *   Only an ACTIVE ADMIN can create invitations.
 *
 * Errors:
 *   - CommunityNotFoundError("Community not found")
 *   - CommunityInvariantError("Community is not active")
 *   - CommunityAuthorizationError("Only an ACTIVE ADMIN can create invitations")
 */

import type { MembershipLookupsPort } from "@/domain/community/membership/membership-lookups";
import {
  CommunityAuthorizationError,
} from "@/domain/community/errors";
import { ensureActiveCommunity } from "../_helpers";

export type EnsureCanCreateInvitationOptions = {
  client: MembershipLookupsPort;
  actor: { id: string };
  communityId: string;
};

/**
 * Validates the actor (ACTIVE ADMIN) can create an invitation.
 */
export async function ensureCanCreateInvitation({
  client,
  actor,
  communityId,
}: EnsureCanCreateInvitationOptions): Promise<void> {
  await ensureActiveCommunity(client, communityId);

  const actorMember = await client.findActiveAdminMember(communityId, actor.id);
  if (!actorMember) {
    throw new CommunityAuthorizationError(
      "Only an ACTIVE ADMIN can create invitations",
    );
  }
}
