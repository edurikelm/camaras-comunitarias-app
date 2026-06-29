import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import type { MembershipLookupsPort } from "@/domain/community/membership/membership-lookups";

/**
 * A single line of defence: detect accidental misuse of top-level client
 * inside a transaction scope.  The adapter is meant to be created once per
 * transaction (via the factory below) so that membership lookups always read
 * from the correct transaction boundary.
 *
 * We distinguish top-level vs transactional by checking for the presence of
 * `$transaction` — a method that only exists on `PrismaClient`, never on
 * `Prisma.TransactionClient`.
 */
function isTopLevelClient(
  client: PrismaClient | Prisma.TransactionClient,
): client is PrismaClient {
  return "$transaction" in client;
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