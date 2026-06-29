import { PrismaClient, type Prisma } from "@/generated/prisma/client";
import type { MembershipLookupsPort } from "@/domain/community/membership/membership-lookups";

/**
 * A single line of defence: detect accidental misuse of top-level client
 * inside a transaction scope.  The adapter is meant to be created once per
 * transaction (via the factory below) so that membership lookups always read
 * from the correct transaction boundary.
 *
 * We distinguish top-level vs transactional using `instanceof PrismaClient`.
 *
 * Why `instanceof` and not `"$transaction" in client`:
 *   Prisma 5.x's transaction proxy (the `tx` passed to
 *   `prisma.$transaction(async (tx) => ...)`) exposes `$transaction` on its
 *   prototype chain at runtime, even though the `TransactionClient` type
 *   derives from `Omit<PrismaClient, ITXClientDenyList>` and therefore
 *   declares `$transaction` as absent.  The `in` operator checks own +
 *   prototype properties, so it produced false positives for legitimate
 *   transactional scopes — every `createPrismaMembershipLookupsAdapter(tx)`
 *   call inside an enclosing `prisma.$transaction` logged a spurious warning.
 *
 *   `instanceof PrismaClient` answers the actual question we care about
 *   ("is this the top-level client, not a tx proxy?") and does not depend
 *   on which methods Prisma happens to deny-list in any given version.
 */
function isTopLevelClient(
  client: PrismaClient | Prisma.TransactionClient,
): client is PrismaClient {
  return client instanceof PrismaClient;
}

/**
 * Creates a MembershipLookupsPort backed by Prisma.
 *
 * The returned adapter works with both a top-level `PrismaClient` (for
 * single-query callers) and a `Prisma.TransactionClient` (for callers that
 * are already inside a `prisma.$transaction` block).  The distinction is
 * made by calling the factory with the appropriate client — callers are
 * responsible for using the right one.
 *
 * IMPORTANT: returns a plain object literal whose methods are OWN properties.
 * Earlier versions wrapped the methods in a class; class methods live on the
 * prototype, so `{...adapter}` in repository UoW factories silently dropped
 * them, breaking every domain policy that calls these lookups.
 *
 * @example
 * // Inside an existing transaction — use the tx client
 * await prisma.$transaction(async (tx) => {
 *   const membershipLookups = createPrismaMembershipLookupsAdapter(tx);
 *   const community = await membershipLookups.findCommunityById(id);
 * });
 */
export function createPrismaMembershipLookupsAdapter(
  client: PrismaClient | Prisma.TransactionClient,
): MembershipLookupsPort {
  if (isTopLevelClient(client)) {
    console.warn(
      "[PrismaMembershipLookupsAdapter] Created with top-level PrismaClient. " +
        "Membership lookups will NOT be part of any enclosing transaction. " +
        "Use the transaction client inside prisma.$transaction instead.",
    );
  }

  return {
    async findCommunityById(id) {
      return client.community.findUnique({
        where: { id },
        select: { id: true, name: true, status: true },
      });
    },

    async findActiveAdminMember(communityId, userId) {
      return client.communityMember.findFirst({
        where: { userId, communityId, role: "ADMIN", status: "ACTIVE" },
        select: {
          id: true,
          userId: true,
          communityId: true,
          role: true,
          status: true,
        },
      });
    },

    async findActiveNeighborOrGuardMember(communityId, userId) {
      return client.communityMember.findFirst({
        where: {
          userId,
          communityId,
          status: "ACTIVE",
          role: { in: ["NEIGHBOR", "GUARD"] },
        },
        select: {
          id: true,
          userId: true,
          communityId: true,
          role: true,
          status: true,
        },
      });
    },

    async findActiveMember(communityId, userId) {
      return client.communityMember.findFirst({
        where: { userId, communityId, status: "ACTIVE" },
        select: {
          id: true,
          userId: true,
          communityId: true,
          role: true,
          status: true,
        },
      });
    },

    async findActiveAdminOrGuardMember(communityId, userId) {
      return client.communityMember.findFirst({
        where: {
          userId,
          communityId,
          status: "ACTIVE",
          role: { in: ["ADMIN", "GUARD"] },
        },
        select: {
          id: true,
          userId: true,
          communityId: true,
          role: true,
          status: true,
        },
      });
    },

    async findSectorById(sectorId) {
      return client.communitySector.findUnique({
        where: { id: sectorId },
        select: { id: true, communityId: true, name: true },
      });
    },
  };
}