/**
 * Authorization policy for uploading evidence.
 *
 * Rule (CONTEXT.md §Evidence Rules):
 *   Only an ACTIVE community member can upload evidence.
 *
 * Errors:
 *   - CommunityNotFoundError("Community not found")
 *   - CommunityInvariantError("Community is not active")
 *   - CommunityAuthorizationError("Only an ACTIVE community member can upload evidence")
 */

import type { MembershipLookupsPort } from "@/domain/community/membership/membership-lookups";
import {
  CommunityAuthorizationError,
} from "@/domain/community/errors";
import { ensureActiveCommunity } from "../_helpers";

export type EnsureCanUploadEvidenceOptions = {
  client: MembershipLookupsPort;
  actor: { id: string };
  communityId: string;
};

/**
 * Validates the actor can upload evidence to the community.
 */
export async function ensureCanUploadEvidence({
  client,
  actor,
  communityId,
}: EnsureCanUploadEvidenceOptions): Promise<void> {
  await ensureActiveCommunity(client, communityId);

  const member = await client.findActiveMember(communityId, actor.id);
  if (!member) {
    throw new CommunityAuthorizationError(
      "Only an ACTIVE community member can upload evidence",
    );
  }
}
