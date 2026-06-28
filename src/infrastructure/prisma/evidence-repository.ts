import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import type { EvidenceRepository } from "@/domain/community/evidence/evidence-repository";
import type {
  CommunityRecord,
  CommunityMemberRecord,
  IncidentRecord,
  EvidenceRecord,
  CreateEvidenceInput,
  CreateAuditLogInput,
} from "@/domain/community/evidence/evidence-repository";
import { createTransactionalRepository } from "@/infrastructure/prisma/_internal/create-transactional-repository";
import type { AuditLogPort } from "@/domain/shared/audit-log";

/**
 * Prisma-backed EvidenceRepository.
 *
 * Metadata is persisted via Prisma. File storage is handled by EvidenceStoragePort
 * which is injected separately into domain services.
 */
export function createPrismaEvidenceRepository(
  prisma: PrismaClient,
  deps: { auditLog: AuditLogPort },
): EvidenceRepository {
  const { auditLog } = deps;

  function createUnitOfWork(
    tx: Prisma.TransactionClient,
  ): EvidenceRepository {
    return {
      // -------------------------------------------------------------------
      // Community queries
      // -------------------------------------------------------------------

      async findCommunityById(id) {
        const row = await tx.community.findUnique({
          where: { id },
          select: { id: true, name: true, status: true },
        });
        return row as CommunityRecord | null;
      },

      async findActiveMember(communityId, userId) {
        const row = await tx.communityMember.findFirst({
          where: {
            userId,
            communityId,
            status: "ACTIVE",
          },
          select: {
            id: true,
            userId: true,
            communityId: true,
            role: true,
            status: true,
          },
        });
        return row as CommunityMemberRecord | null;
      },

      async findActiveAdminOrGuardMember(communityId, userId) {
        const row = await tx.communityMember.findFirst({
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
        return row as CommunityMemberRecord | null;
      },

      // -------------------------------------------------------------------
      // Incident queries
      // -------------------------------------------------------------------

      async findIncidentById(communityId, incidentId) {
        const row = await tx.incident.findFirst({
          where: { id: incidentId, communityId },
          select: {
            id: true,
            communityId: true,
            createdById: true,
            status: true,
          },
        });
        return row as IncidentRecord | null;
      },

      // -------------------------------------------------------------------
      // Evidence queries / mutations
      // -------------------------------------------------------------------

      async findEvidenceByIncident(incidentId) {
        const rows = await tx.evidence.findMany({
          where: { incidentId, deletedAt: null },
          select: {
            id: true,
            communityId: true,
            incidentId: true,
            uploadedById: true,
            storagePath: true,
            mimeType: true,
            metadata: true,
            createdAt: true,
            deletedAt: true,
          },
          orderBy: { createdAt: "asc" },
        });
        return rows as EvidenceRecord[];
      },

      async createEvidence(input: CreateEvidenceInput) {
        const row = await tx.evidence.create({
          data: {
            communityId: input.communityId,
            incidentId: input.incidentId,
            uploadedById: input.uploadedById,
            storagePath: input.storagePath,
            mimeType: input.mimeType,
            metadata: (input.metadata ?? {}) as Prisma.InputJsonValue,
          },
          select: {
            id: true,
            communityId: true,
            incidentId: true,
            uploadedById: true,
            storagePath: true,
            mimeType: true,
            metadata: true,
            createdAt: true,
            deletedAt: true,
          },
        });
        return row as EvidenceRecord;
      },

      // -------------------------------------------------------------------
      // Audit
      // -------------------------------------------------------------------

      async createAuditLog(input: CreateAuditLogInput) {
        await auditLog.record({
          communityId: input.communityId,
          actorId: input.actorId,
          action: input.action,
          entityType: input.entityType,
          entityId: input.entityId,
          metadata: input.metadata,
        });
      },

      // -------------------------------------------------------------------
      // Transaction (only on top-level)
      // -------------------------------------------------------------------

      runInTransaction<T>(
        _operation: (uow: EvidenceRepository) => Promise<T>,
      ): Promise<T> {
        throw new Error(
          "runInTransaction is only available on the top-level repository, not on a scoped UoW",
        );
      },
    };
  }

  return createTransactionalRepository<EvidenceRepository, EvidenceRepository>(
    prisma,
    createUnitOfWork,
  );
}
