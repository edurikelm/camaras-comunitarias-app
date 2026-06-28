import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import type { EvidenceRepository } from "@/domain/community/evidence/evidence-repository";
import type {
  CommunityRecord,
  CommunityMemberRecord,
  IncidentRecord,
  EvidenceRecord,
  CreateEvidenceInput,
  UploadFileInput,
  CreateAuditLogInput,
} from "@/domain/community/evidence/evidence-repository";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

/**
 * Prisma + Supabase Storage backed EvidenceRepository.
 *
 * File uploads and signed URL generation go through the Supabase admin client
 * (service_role key), while metadata is persisted via Prisma.
 */
export function createPrismaEvidenceRepository(
  prisma: PrismaClient,
): EvidenceRepository {
  const STORAGE_BUCKET = "evidence";

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
      // Storage operations (Supabase)
      // -------------------------------------------------------------------

      async uploadFile(input: UploadFileInput) {
        const supabase = getSupabaseAdmin();
        const fileBytes =
          input.file instanceof Buffer
            ? input.file
            : Buffer.from(new Uint8Array(input.file as ArrayBuffer));

        const { error } = await supabase.storage
          .from(STORAGE_BUCKET)
          .upload(input.storagePath, fileBytes, {
            contentType: input.mimeType,
            upsert: false,
          });

        if (error) {
          throw new Error(
            `Failed to upload file to Supabase Storage: ${error.message}`,
          );
        }
      },

      async createSignedUrl(storagePath, expiresInSeconds) {
        const supabase = getSupabaseAdmin();

        const { data, error } = await supabase.storage
          .from(STORAGE_BUCKET)
          .createSignedUrl(storagePath, expiresInSeconds);

        if (error || !data) {
          throw new Error(
            `Failed to create signed URL: ${error?.message ?? "unknown error"}`,
          );
        }

        return data.signedUrl;
      },

      // -------------------------------------------------------------------
      // Audit
      // -------------------------------------------------------------------

      async createAuditLog(input: CreateAuditLogInput) {
        await tx.auditLog.create({
          data: {
            communityId: input.communityId,
            actorId: input.actorId,
            action: input.action,
            entityType: input.entityType,
            entityId: input.entityId,
            metadata: (input.metadata ?? {}) as Prisma.InputJsonValue,
          },
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

  const directUow = createUnitOfWork(prisma);

  return {
    ...directUow,

    runInTransaction<T>(
      operation: (uow: EvidenceRepository) => Promise<T>,
    ): Promise<T> {
      return prisma.$transaction(async (tx) => {
        const scopedUow = createUnitOfWork(tx);
        return operation(scopedUow);
      });
    },
  };
}
