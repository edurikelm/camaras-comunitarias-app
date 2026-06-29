/**
 * Authorization policy for registering a camera.
 *
 * Rule (CONTEXT.md §Camera Permission Rules):
 *   Only an ACTIVE NEIGHBOR, GUARD, or ADMIN can register a camera.
 *
 * Errors:
 *   - CommunityNotFoundError("Community not found") — community does not exist
 *   - CommunityInvariantError("Community is not active") — community not ACTIVE
 *   - CommunityAuthorizationError("Only an ACTIVE NEIGHBOR, GUARD, or ADMIN can register a camera")
 */

import type { MembershipLookupsPort } from "@/domain/community/membership/membership-lookups";
import {
  CommunityAuthorizationError,
  CommunityInvariantError,
  CommunityNotFoundError,
} from "@/domain/community/errors";
import { ensureActiveCommunity, findAnyActiveMember } from "../_helpers";

export type EnsureCanRegisterCameraOptions = {
  client: MembershipLookupsPort;
  actor: { id: string };
  communityId: string;
};

/**
 * Throws if the actor is not an ACTIVE NEIGHBOR, GUARD, or ADMIN of the community.
 * Preserves check order: 404 → 400 → 403.
 */
export async function ensureCanRegisterCamera({
  client,
  actor,
  communityId,
}: EnsureCanRegisterCameraOptions): Promise<void> {
  await ensureActiveCommunity(client, communityId);

  const member = await findAnyActiveMember(client, communityId, actor.id);
  if (!member) {
    throw new CommunityAuthorizationError(
      "Only an ACTIVE NEIGHBOR, GUARD, or ADMIN can register a camera",
    );
  }
}
