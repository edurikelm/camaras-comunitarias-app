import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import type {
  PlatformCommunityRepository,
  PlatformCommunityUnitOfWork,
} from "@/domain/platform/create-community-with-first-admin";

/**
 * Creates a Prisma-backed PlatformCommunityRepository.
 *
 * `runInTransaction` delegates to `prisma.$transaction` passing a unit of work
 * scoped to the transaction client.
 *
 * Direct calls to UoW methods (outside transaction) use the primary prisma
 * instance. The domain service only calls UoW methods inside runInTransaction,
 * so they always run in a transaction.
 */
export function createPrismaPlatformCommunityRepository(
  prisma: PrismaClient,
): PlatformCommunityRepository {
  function createUnitOfWork(tx: Prisma.TransactionClient): PlatformCommunityUnitOfWork {
    return {
      async createCommunity(input) {
        const record = await tx.community.create({
          data: {
            name: input.name,
            address: input.address,
            status: input.status,
          },
          select: { id: true, name: true, address: true, status: true },
        });
        return record;
      },

      async upsertUserByAuthProviderId(input) {
        const record = await tx.user.upsert({
          where: { authProviderId: input.authProviderId },
          create: {
            authProviderId: input.authProviderId,
            email: input.email,
            name: input.name,
          },
          update: {
            email: input.email,
            name: input.name,
          },
          select: {
            id: true,
            authProviderId: true,
            email: true,
            name: true,
            platformRole: true,
          },
        });
        return record;
      },

      async findCommunityMemberByUserId(userId) {
        const member = await tx.communityMember.findUnique({
          where: { userId },
          select: { id: true, userId: true, communityId: true },
        });
        return member;
      },

      async createCommunityMember(input) {
        const record = await tx.communityMember.create({
          data: {
            userId: input.userId,
            communityId: input.communityId,
            role: input.role,
            status: input.status,
          },
          select: { id: true, userId: true, communityId: true, role: true, status: true },
        });
        return record;
      },

      async createAuditLog(input) {
        await tx.auditLog.create({
          data: {
            communityId: input.communityId,
            actorId: input.actorId,
            action: input.action,
            entityType: input.entityType,
            entityId: input.entityId,
            metadata: input.metadata as Prisma.InputJsonValue,
          },
        });
      },
    };
  }

  const directUow = createUnitOfWork(prisma);

  return {
    ...directUow,

    runInTransaction<T>(
      operation: (uow: PlatformCommunityUnitOfWork) => Promise<T>,
    ): Promise<T> {
      return prisma.$transaction(async (tx) => {
        const scopedUow = createUnitOfWork(tx);
        return operation(scopedUow);
      });
    },
  };
}
