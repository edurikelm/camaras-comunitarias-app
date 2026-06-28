import { AuditAction } from "@/generated/prisma/enums";
import {
  CommunityAuthorizationError,
  CommunityInvariantError,
  CommunityNotFoundError,
} from "@/domain/community/errors";
import type {
  EvidenceRepository,
  EvidenceWithSignedUrl,
} from "./evidence-repository";

// ---------------------------------------------------------------------------
// Input
// ---------------------------------------------------------------------------

export type GetEvidenceInput = {
  actor: { id: string };
  communityId: string;
  incidentId: string;
};

// ---------------------------------------------------------------------------
// Result
// ---------------------------------------------------------------------------

export type EvidenceItem = {
  id: string;
  mimeType: string;
  signedUrl: string;
  metadata: Record<string, unknown> | null;
  createdAt: Date;
};

export type GetEvidenceResult = {
  items: EvidenceItem[];
};

// ---------------------------------------------------------------------------
// Deps
// ---------------------------------------------------------------------------

export type GetEvidenceDeps = {
  evidenceRepository: EvidenceRepository;
};

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

const SIGNED_URL_EXPIRY_SECONDS = 3600; // 1 hour

/**
 * Returns all evidence items for an incident with signed URLs.
 *
 * Authorization rules:
 * - Creator of the incident can view evidence.
 * - ADMIN or GUARD members (ACTIVE) of the community can view evidence.
 * - Other community members (NEIGHBOR) CANNOT view evidence by default.
 *   (This aligns with the domain rule: vecinos notificados ven resumen,
 *    NO evidencia completa.)
 */
export async function getEvidence(
  input: GetEvidenceInput,
  { evidenceRepository }: GetEvidenceDeps,
): Promise<GetEvidenceResult> {
  const { communityId, incidentId } = input;

  // 1. Validate community exists and is ACTIVE
  const community = await evidenceRepository.findCommunityById(communityId);
  if (!community) {
    throw new CommunityNotFoundError("Community not found");
  }
  if (community.status !== "ACTIVE") {
    throw new CommunityInvariantError("Community is not active");
  }

  // 2. Validate incident exists in this community
  const incident = await evidenceRepository.findIncidentById(
    communityId,
    incidentId,
  );
  if (!incident) {
    throw new CommunityNotFoundError("Incident not found");
  }

  // 3. Check actor authorization:
  //    - Creator of the incident can view evidence, OR
  //    - ACTIVE ADMIN or GUARD member of the community can view evidence
  const isCreator = incident.createdById === input.actor.id;

  if (!isCreator) {
    const authorizedMember =
      await evidenceRepository.findActiveAdminOrGuardMember(
        communityId,
        input.actor.id,
      );
    if (!authorizedMember) {
      throw new CommunityAuthorizationError(
        "Only the incident creator, an ADMIN, or a GUARD can view evidence",
      );
    }
  }

  // 4. Fetch all evidence records for this incident
  const evidenceRecords = await evidenceRepository.findEvidenceByIncident(
    incidentId,
  );

  // 5. Generate signed URLs for each evidence item
  const items: EvidenceItem[] = await Promise.all(
    evidenceRecords.map(async (record) => {
      const signedUrl = await evidenceRepository.createSignedUrl(
        record.storagePath,
        SIGNED_URL_EXPIRY_SECONDS,
      );

      // Audit each access
      await evidenceRepository.createAuditLog({
        communityId,
        actorId: input.actor.id,
        action: AuditAction.EVIDENCE_VIEWED,
        entityType: "Evidence",
        entityId: record.id,
        metadata: {
          incidentId,
          storagePath: record.storagePath,
        },
      });

      return {
        id: record.id,
        mimeType: record.mimeType,
        signedUrl,
        metadata: record.metadata as Record<string, unknown> | null,
        createdAt: record.createdAt,
      };
    }),
  );

  return { items };
}
