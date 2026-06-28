import {
  AuditAction,
  CommunityMemberRole,
  CommunityMemberStatus,
  CommunityStatus,
  IncidentStatus,
} from "@/generated/prisma/enums";

// ---------------------------------------------------------------------------
// Record types
// ---------------------------------------------------------------------------

export type CommunityRecord = {
  id: string;
  name: string;
  status: CommunityStatus;
};

export type CommunityMemberRecord = {
  id: string;
  userId: string;
  communityId: string;
  role: CommunityMemberRole;
  status: CommunityMemberStatus;
};

export type IncidentRecord = {
  id: string;
  communityId: string;
  createdById: string;
  status: IncidentStatus;
};

export type EvidenceRecord = {
  id: string;
  communityId: string;
  incidentId: string;
  uploadedById: string;
  storagePath: string;
  mimeType: string;
  metadata: Record<string, unknown> | null;
  createdAt: Date;
  deletedAt: Date | null;
};

export type EvidenceWithSignedUrl = EvidenceRecord & {
  signedUrl: string;
};

// ---------------------------------------------------------------------------
// Input types
// ---------------------------------------------------------------------------

export type CreateEvidenceInput = {
  communityId: string;
  incidentId: string;
  uploadedById: string;
  storagePath: string;
  mimeType: string;
  metadata?: Record<string, unknown>;
};

export type CreateAuditLogInput = {
  communityId: string;
  actorId: string;
  action: AuditAction;
  entityType: string;
  entityId: string;
  metadata?: Record<string, unknown>;
};

// ---------------------------------------------------------------------------
// Repository interface
// ---------------------------------------------------------------------------

export interface EvidenceRepository {
  // Community queries
  findCommunityById(id: string): Promise<CommunityRecord | null>;
  findActiveMember(
    communityId: string,
    userId: string,
  ): Promise<CommunityMemberRecord | null>;
  findActiveAdminOrGuardMember(
    communityId: string,
    userId: string,
  ): Promise<CommunityMemberRecord | null>;

  // Incident queries
  findIncidentById(
    communityId: string,
    incidentId: string,
  ): Promise<IncidentRecord | null>;

  // Evidence queries / mutations
  findEvidenceByIncident(incidentId: string): Promise<EvidenceRecord[]>;
  createEvidence(input: CreateEvidenceInput): Promise<EvidenceRecord>;

  // Audit
  createAuditLog(input: CreateAuditLogInput): Promise<void>;

  // Transaction support
  runInTransaction<T>(
    operation: (uow: EvidenceRepository) => Promise<T>,
  ): Promise<T>;
}
