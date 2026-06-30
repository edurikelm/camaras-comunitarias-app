/**
 * Authorization policy for creating an incident.
 *
 * Rule (CONTEXT.md §Incident Rules):
 *   Any ACTIVE community member can create an incident, regardless of role.
 *   Esto incluye NEIGHBOR, GUARD y ADMIN, consistente con la regla general
 *   "ADMIN incluye las capacidades base de NEIGHBOR mas gestion administrativa".
 *
 * Errors:
 *   - CommunityNotFoundError("Community not found")
 *   - CommunityInvariantError("Community is not active")
 *   - CommunityAuthorizationError("Only an ACTIVE community member can create an incident")
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
 * Validates the actor (any ACTIVE member) can create an incident.
 */
export async function ensureCanCreateIncident({
  client,
  actor,
  communityId,
}: EnsureCanCreateIncidentOptions): Promise<void> {
  await ensureActiveCommunity(client, communityId);

  const member = await client.findActiveMember(communityId, actor.id);
  if (!member) {
    throw new CommunityAuthorizationError(
      "Only an ACTIVE community member can create an incident",
    );
  }
}
