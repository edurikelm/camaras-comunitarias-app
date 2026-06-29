import type { MembershipLookupsPort } from "@/domain/community/membership/membership-lookups";
import type { MemberLookupRecord } from "@/domain/community/membership/membership-lookups";
import {
  CommunityInvariantError,
  CommunityNotFoundError,
} from "@/domain/community/errors";

/**
 * Augments a port with the membership lookups so callers can pass
 * a intersection like `MembershipLookupsPort & Pick<CameraRepository, "findCameraById">`.
 */
export type WithLookups<T> = MembershipLookupsPort & T;

/**
 * Ensures the community exists and is ACTIVE.
 * Throws CommunityNotFoundError("Community not found") if missing.
 * Throws CommunityInvariantError("Community is not active") if not ACTIVE.
 *
 * Check order: 404 before 400 (observable HTTP response semantics).
 */
export async function ensureActiveCommunity(
  client: MembershipLookupsPort,
  communityId: string,
): Promise<void> {
  const community = await client.findCommunityById(communityId);
  if (!community) {
    throw new CommunityNotFoundError("Community not found");
  }
  if (community.status !== "ACTIVE") {
    throw new CommunityInvariantError("Community is not active");
  }
}

/**
 * Finds any active member (NEIGHBOR, GUARD, or ADMIN) for the given
 * community+user pair. Tries findActiveNeighborOrGuardMember first;
 * falls back to findActiveAdminMember.
 *
 * Returns null if no active membership exists.
 */
export async function findAnyActiveMember(
  client: MembershipLookupsPort,
  communityId: string,
  userId: string,
): Promise<MemberLookupRecord | null> {
  const neighborOrGuard = await client.findActiveNeighborOrGuardMember(
    communityId,
    userId,
  );
  if (neighborOrGuard) return neighborOrGuard;
  return client.findActiveAdminMember(communityId, userId);
}
