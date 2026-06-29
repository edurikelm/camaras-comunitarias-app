import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import type { RecordingRequestRepository } from "@/domain/community/recording/recording-request-repository";
import type {
  IncidentLookupRecord,
  CameraLookupRecord,
  RecordingRequestRecord,
  CreateRecordingRequestInsert,
  UpdateRecordingRequestInput,
  CreateAuditLogInput,
} from "@/domain/community/recording/recording-request-repository";
import { createTransactionalRepository } from "@/infrastructure/prisma/_internal/create-transactional-repository";
import type { AuditLogPort } from "@/domain/shared/audit-log";
import { createPrismaMembershipLookupsAdapter } from "@/infrastructure/prisma/membership-lookups-adapter";

/**
 * Prisma-backed RecordingRequestRepository.
 *
 * `runInTransaction` delegates to `prisma.$transaction` with a scoped unit of work.
 */
export function createPrismaRecordingRequestRepository(
  prisma: PrismaClient,
  deps: { auditLog: AuditLogPort },
): RecordingRequestRepository {
  const { auditLog } = deps;

  function createUnitOfWork(
    tx: Prisma.TransactionClient,
  ): RecordingRequestRepository {
    const membershipLookups = createPrismaMembershipLookupsAdapter(tx);

    return {
      ...membershipLookups,

      // -----------------------------------------------------------------------
      // Lookup queries
      // -----------------------------------------------------------------------

      async findIncidentById(id) {
        const row = await tx.incident.findUnique({
          where: { id },
          select: {
            id: true,
            communityId: true,
            createdById: true,
            status: true,
          },
        });
        return row as IncidentLookupRecord | null;
      },

      async findCameraById(id) {
        const row = await tx.camera.findUnique({
          where: { id },
          select: {
            id: true,
            communityId: true,
            ownerId: true,
            status: true,
          },
        });
        return row as CameraLookupRecord | null;
      },

      async findRecordingRequestById(id) {
        const row = await tx.recordingRequest.findUnique({
          where: { id },
          select: {
            id: true,
            incidentId: true,
            cameraId: true,
            requestedById: true,
            ownerId: true,
            startTime: true,
            endTime: true,
            reason: true,
            status: true,
            ownerComment: true,
            createdAt: true,
          },
        });
        return row as RecordingRequestRecord | null;
      },

      // -----------------------------------------------------------------------
      // Mutations
      // -----------------------------------------------------------------------

      async createRecordingRequest(input: CreateRecordingRequestInsert) {
        const row = await tx.recordingRequest.create({
          data: {
            incidentId: input.incidentId,
            cameraId: input.cameraId,
            requestedById: input.requestedById,
            ownerId: input.ownerId,
            startTime: input.startTime,
            endTime: input.endTime,
            reason: input.reason,
            status: input.status,
          },
          select: {
            id: true,
            incidentId: true,
            cameraId: true,
            requestedById: true,
            ownerId: true,
            startTime: true,
            endTime: true,
            reason: true,
            status: true,
            ownerComment: true,
            createdAt: true,
          },
        });
        return row as RecordingRequestRecord;
      },

      async updateRecordingRequest(id: string, input: UpdateRecordingRequestInput) {
        const updateData: Prisma.RecordingRequestUpdateInput = {};
        if (input.status !== undefined) {
          updateData.status = input.status;
        }
        if (input.ownerComment !== undefined) {
          updateData.ownerComment = input.ownerComment;
        }

        const row = await tx.recordingRequest.update({
          where: { id },
          data: updateData,
          select: {
            id: true,
            incidentId: true,
            cameraId: true,
            requestedById: true,
            ownerId: true,
            startTime: true,
            endTime: true,
            reason: true,
            status: true,
            ownerComment: true,
            createdAt: true,
          },
        });
        return row as RecordingRequestRecord;
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
        _operation: (uow: RecordingRequestRepository) => Promise<T>,
      ): Promise<T> {
        throw new Error(
          "runInTransaction is only available on the top-level repository, not on a scoped UoW",
        );
      },
    };
  }

  return createTransactionalRepository<
    RecordingRequestRepository,
    RecordingRequestRepository
  >(prisma, createUnitOfWork);
}
