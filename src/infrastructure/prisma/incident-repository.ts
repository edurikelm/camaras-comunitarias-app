import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import type { IncidentRepository } from "@/domain/community/incident/incident-repository";
import type {
  IncidentRecord,
  AlertRecord,
  CreateIncidentInsert,
  CreateAlertInsert,
  CreateAuditLogInput,
} from "@/domain/community/incident/incident-repository";
import { createTransactionalRepository } from "@/infrastructure/prisma/_internal/create-transactional-repository";
import type { AuditLogPort } from "@/domain/shared/audit-log";
import { createPrismaMembershipLookupsAdapter } from "@/infrastructure/prisma/membership-lookups-adapter";

/**
 * Prisma-backed IncidentRepository.
 *
 * `runInTransaction` delegates to `prisma.$transaction` with a scoped unit of work.
 */
export function createPrismaIncidentRepository(
  prisma: PrismaClient,
  deps: { auditLog: AuditLogPort },
): IncidentRepository {
  const { auditLog } = deps;

  function createUnitOfWork(
    tx: Prisma.TransactionClient,
  ): IncidentRepository {
    const membershipLookups = createPrismaMembershipLookupsAdapter(tx);

    return {
      ...membershipLookups,

      // -----------------------------------------------------------------------
      // Incident mutations
      // -----------------------------------------------------------------------

      async createIncident(input: CreateIncidentInsert) {
        const row = await tx.incident.create({
          data: {
            communityId: input.communityId,
            createdById: input.createdById,
            sectorId: input.sectorId,
            type: input.type,
            severity: input.severity,
            description: input.description,
            location: input.location,
          },
          select: {
            id: true,
            communityId: true,
            createdById: true,
            sectorId: true,
            type: true,
            severity: true,
            status: true,
            description: true,
            location: true,
            closedReason: true,
            closedAt: true,
            createdAt: true,
          },
        });
        return row as IncidentRecord;
      },

      async createAlert(input: CreateAlertInsert) {
        const row = await tx.alert.create({
          data: {
            communityId: input.communityId,
            incidentId: input.incidentId,
            sectorId: input.sectorId,
            severity: input.severity,
            type: input.type,
            message: input.message,
          },
          select: {
            id: true,
            communityId: true,
            incidentId: true,
            sectorId: true,
            severity: true,
            type: true,
            message: true,
            createdAt: true,
          },
        });
        // createdAt is not selected in the mock type but we include it
        return row as unknown as AlertRecord;
      },

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

      // -----------------------------------------------------------------------
      // Transaction (only on top-level, not on scoped UoW)
      // -----------------------------------------------------------------------

      runInTransaction<T>(
        _operation: (uow: IncidentRepository) => Promise<T>,
      ): Promise<T> {
        throw new Error(
          "runInTransaction is only available on the top-level repository, not on a scoped UoW",
        );
      },
    };
  }

  return createTransactionalRepository<IncidentRepository, IncidentRepository>(
    prisma,
    createUnitOfWork,
  );
}
