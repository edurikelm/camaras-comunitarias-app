/**
 * Authorization policy for creating an incident.
 *
 * Rule (CONTEXT.md §Incident Rules):
 *   Only an ACTIVE NEIGHBOR or GUARD can create an incident.
 *
 * Errors:
 *   - CommunityNotFoundError("Community not found")
 *   - CommunityInvariantError("Community is not active")
 *   - CommunityAuthorizationError("Only an ACTIVE NEIGHBOR or GUARD can create an incident")
 */

import type { MembershipLookupsPort } from "@/domain/community/membership/membership-lookups";
import {
  CommunityAuthorizationError,
  CommunityNotFoundError,
} from "@/domain/community/errors";
import { ensureActiveCommunity } from "../_helpers";

export type EnsureCanCreateIncidentOptions = {
  client: MembershipLookupsPort;
  actor: { id: string };
  communityId: string;
};

/**
 * Validates the actor (NEIGHBOR or GUARD) can create an incident.
 */
export async function ensureCanCreateIncident({
  client,
  actor,
  communityId,
}: EnsureCanCreateIncidentOptions): Promise<void> {
  await ensureActiveCommunity(client, communityId);

  const member = await client.findActiveNeighborOrGuardMember(
    communityId,
    actor.id,
  );
  if (!member) {
    throw new CommunityAuthorizationError(
      "Only an ACTIVE NEIGHBOR or GUARD can create an incident",
    );
  }
}
