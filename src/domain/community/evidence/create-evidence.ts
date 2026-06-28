import { randomUUID } from "node:crypto";
import { AuditAction, IncidentStatus } from "@/generated/prisma/enums";
import {
  CommunityAuthorizationError,
  CommunityInvariantError,
  CommunityNotFoundError,
} from "@/domain/community/errors";
import type { EvidenceRepository } from "./evidence-repository";
import type { EvidenceStoragePort } from "./evidence-storage";

// ---------------------------------------------------------------------------
// Allowed MIME types for evidence uploads
// ---------------------------------------------------------------------------

const ALLOWED_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);

const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB

// ---------------------------------------------------------------------------
// Input
// ---------------------------------------------------------------------------

export type UploadEvidenceInput = {
  actor: { id: string };
  communityId: string;
  incidentId: string;
  /** Raw file contents */
  file: Buffer | ArrayBuffer;
  /** MIME type of the file (validated against allowed types) */
  mimeType: string;
  /** Optional metadata to store alongside the evidence */
  metadata?: Record<string, unknown>;
};

// ---------------------------------------------------------------------------
// Result
// ---------------------------------------------------------------------------

export type UploadEvidenceResult = {
  evidence: {
    id: string;
    communityId: string;
    incidentId: string;
    uploadedById: string;
    storagePath: string;
    mimeType: string;
    metadata: Record<string, unknown> | null;
    createdAt: Date;
  };
};

// ---------------------------------------------------------------------------
// Deps
// ---------------------------------------------------------------------------

export type UploadEvidenceDeps = {
  evidenceRepository: EvidenceRepository;
  evidenceStorage: EvidenceStoragePort;
};

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

/**
 * Uploads an evidence file (image) for an incident.
 *
 * Validation rules:
 * - Actor must be an ACTIVE member (NEIGHBOR, GUARD, or ADMIN).
 * - Incident must exist in the same community and be OPEN or REVIEWING.
 * - MIME type must be one of: image/jpeg, image/png, image/webp.
 * - File size must not exceed 5 MB.
 *
 * Storage-first with compensation: uploads to storage BEFORE the Prisma
 * transaction. If the transaction fails, deletes the uploaded file.
 */
export async function uploadEvidence(
  input: UploadEvidenceInput,
  { evidenceRepository, evidenceStorage }: UploadEvidenceDeps,
): Promise<UploadEvidenceResult> {
  const communityId = input.communityId.trim();
  if (!communityId) {
    throw new CommunityInvariantError("communityId is required");
  }

  const incidentId = input.incidentId.trim();
  if (!incidentId) {
    throw new CommunityInvariantError("incidentId is required");
  }

  // Validate MIME type
  if (!ALLOWED_MIME_TYPES.has(input.mimeType)) {
    throw new CommunityInvariantError(
      `Invalid MIME type: ${input.mimeType}. Allowed: ${Array.from(ALLOWED_MIME_TYPES).join(", ")}`,
    );
  }

  // Validate file size
  const fileBuffer: Buffer =
    input.file instanceof Buffer ? input.file : Buffer.from(new Uint8Array(input.file));
  const fileSize = fileBuffer.length;
  if (fileSize === 0) {
    throw new CommunityInvariantError("File is empty");
  }
  if (fileSize > MAX_FILE_SIZE_BYTES) {
    throw new CommunityInvariantError(
      `File exceeds maximum size of ${MAX_FILE_SIZE_BYTES / (1024 * 1024)} MB`,
    );
  }

  // Generate storage path BEFORE the transaction
  const ext = mimeTypeToExtension(input.mimeType);
  const storageId = randomUUID();
  const storagePath = `${communityId}/${incidentId}/${storageId}.${ext}`;

  // 1. Upload file to storage BEFORE the transaction
  await evidenceStorage.uploadFile({
    storagePath,
    file: fileBuffer,
    mimeType: input.mimeType,
  });

  // 2. Execute Prisma transaction with compensation on failure
  try {
    return await evidenceRepository.runInTransaction(async (tx) => {
      // Validate community exists and is ACTIVE
      const community = await tx.findCommunityById(communityId);
      if (!community) {
        throw new CommunityNotFoundError("Community not found");
      }
      if (community.status !== "ACTIVE") {
        throw new CommunityInvariantError("Community is not active");
      }

      // Validate actor is an ACTIVE member (any role: NEIGHBOR, GUARD, ADMIN)
      const actorMember = await tx.findActiveMember(communityId, input.actor.id);
      if (!actorMember) {
        throw new CommunityAuthorizationError(
          "Only an ACTIVE community member can upload evidence",
        );
      }

      // Validate incident exists in the same community and is OPEN or REVIEWING
      const incident = await tx.findIncidentById(communityId, incidentId);
      if (!incident) {
        throw new CommunityNotFoundError("Incident not found");
      }
      if (
        incident.status !== IncidentStatus.OPEN &&
        incident.status !== IncidentStatus.REVIEWING
      ) {
        throw new CommunityInvariantError(
          "Evidence can only be uploaded to OPEN or REVIEWING incidents",
        );
      }

      // Persist evidence record in DB
      const evidence = await tx.createEvidence({
        communityId,
        incidentId,
        uploadedById: input.actor.id,
        storagePath,
        mimeType: input.mimeType,
        metadata: input.metadata,
      });

      // Audit
      await tx.createAuditLog({
        communityId,
        actorId: input.actor.id,
        action: AuditAction.EVIDENCE_UPLOADED,
        entityType: "Evidence",
        entityId: evidence.id,
        metadata: {
          incidentId,
          storagePath,
          mimeType: input.mimeType,
          fileSize,
        },
      });

      return {
        evidence: {
          id: evidence.id,
          communityId: evidence.communityId,
          incidentId: evidence.incidentId,
          uploadedById: evidence.uploadedById,
          storagePath: evidence.storagePath,
          mimeType: evidence.mimeType,
          metadata: evidence.metadata as Record<string, unknown> | null,
          createdAt: evidence.createdAt,
        },
      };
    });
  } catch (err) {
    // Compensate: delete the uploaded file if the transaction failed
    try {
      await evidenceStorage.deleteFile(storagePath);
    } catch (cleanupErr) {
      console.error(
        `[uploadEvidence] Orphan storage object at ${storagePath} after DB failure:`,
        cleanupErr,
      );
    }
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mimeTypeToExtension(mimeType: string): string {
  const map: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
  };
  return map[mimeType] ?? "bin";
}
