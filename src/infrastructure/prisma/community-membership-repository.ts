import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import type {
  CommunityMembershipRepository,
  CommunityUnitOfWork,
} from "@/domain/community/community-repository";
import { createTransactionalRepository } from "@/infrastructure/prisma/_internal/create-transactional-repository";
import { createPrismaAuditLogAdapter } from "@/infrastructure/prisma/audit-log-adapter";
import { createPrismaMembershipLookupsAdapter } from "@/infrastructure/prisma/membership-lookups-adapter";

/**
 * Prisma-backed CommunityMembershipRepository.
 *
 * `runInTransaction` delegates to `prisma.$transaction` with a scoped unit of work.
 */
export function createPrismaCommunityMembershipRepository(
  prisma: PrismaClient,
  _deps?: object,
): CommunityMembershipRepository {
  function createUnitOfWork(tx: Prisma.TransactionClient): CommunityUnitOfWork {
    const membershipLookups = createPrismaMembershipLookupsAdapter(tx);
    // Use transaction-scoped audit log so writes are part of the same transaction.
    // The previous approach captured a top-level auditLog via closure, writing
    // outside the transaction — if that write failed, the invitation was already
    // committed but the error propagated as an unhandled 500.
    const auditLog = createPrismaAuditLogAdapter(tx);

    return {
      ...membershipLookups,

      async findCommunityMemberByUserId(userId) {
        const record = await tx.communityMember.findUnique({
          where: { userId },
          select: { id: true, userId: true, communityId: true, role: true, status: true },
        });
        return record;
      },

      async findCommunityMemberById(id) {
        const record = await tx.communityMember.findUnique({
          where: { id },
          select: { id: true, userId: true, communityId: true, role: true, status: true },
        });
        return record;
      },

      async findInvitationByCodeHash(codeHash) {
        const record = await tx.communityInvitation.findUnique({
          where: { codeHash },
          select: {
            id: true,
            communityId: true,
            codeHash: true,
            expiresAt: true,
            usedAt: true,
            revokedAt: true,
            createdAt: true,
          },
        });
        return record;
      },

      async createCommunityInvitation(input) {
        const record = await tx.communityInvitation.create({
          data: {
            communityId: input.communityId,
            codeHash: input.codeHash,
            createdById: input.createdById,
            expiresAt: input.expiresAt,
          },
          select: {
            id: true,
            communityId: true,
            codeHash: true,
            expiresAt: true,
            usedAt: true,
            revokedAt: true,
            createdAt: true,
          },
        });
        return record;
      },

      async markInvitationUsedIfAvailable(id) {
        const now = new Date();
        const result = await tx.communityInvitation.updateMany({
          where: {
            id,
            usedAt: null,
            revokedAt: null,
            OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
          },
          data: { usedAt: now },
        });
        return result.count > 0;
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

      async updateCommunityMember(id, input) {
        const updateData: Prisma.CommunityMemberUpdateInput = {};
        if (input.role !== undefined) {
          updateData.role = input.role;
        }
        if (input.status !== undefined) {
          updateData.status = input.status;
        }

        const record = await tx.communityMember.update({
          where: { id },
          data: updateData,
          select: { id: true, userId: true, communityId: true, role: true, status: true },
        });
        return record;
      },

      async createAuditLog(input) {
        await auditLog.record({
          communityId: input.communityId,
          actorId: input.actorId,
          action: input.action,
          entityType: input.entityType,
          entityId: input.entityId,
          metadata: input.metadata,
        });
      },
    };
  }

  return createTransactionalRepository<
    CommunityMembershipRepository,
    CommunityUnitOfWork
  >(prisma, createUnitOfWork);
}
