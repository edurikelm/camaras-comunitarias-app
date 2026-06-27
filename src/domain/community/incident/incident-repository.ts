import {
  AuditAction,
  CommunityMemberRole,
  CommunityMemberStatus,
  CommunityStatus,
  IncidentStatus,
  IncidentType,
  AlertSeverity,
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

export type SectorRecord = {
  id: string;
  communityId: string;
  name: string;
};

export type IncidentRecord = {
  id: string;
  communityId: string;
  createdById: string;
  sectorId: string | null;
  type: IncidentType;
  severity: AlertSeverity;
  status: IncidentStatus;
  description: string;
  location: string | null;
  closedReason: string | null;
  closedAt: Date | null;
  createdAt: Date;
};

export type AlertRecord = {
  id: string;
  communityId: string;
  incidentId: string | null;
  sectorId: string | null;
  severity: AlertSeverity;
  type: string;
  message: string;
  createdAt: Date;
};

// ---------------------------------------------------------------------------
// Input types
// ---------------------------------------------------------------------------

export type CreateIncidentInsert = {
  communityId: string;
  createdById: string;
  sectorId: string | null;
  type: IncidentType;
  severity: AlertSeverity;
  description: string;
  location: string | null;
};

export type CreateAlertInsert = {
  communityId: string;
  incidentId: string;
  sectorId: string | null;
  severity: AlertSeverity;
  type: string;
  message: string;
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

export interface IncidentRepository {
  // Community queries
  findCommunityById(id: string): Promise<CommunityRecord | null>;
  findActiveNeighborOrGuardMember(
    communityId: string,
    userId: string,
  ): Promise<CommunityMemberRecord | null>;
  findActiveAdminMember(
    communityId: string,
    userId: string,
  ): Promise<CommunityMemberRecord | null>;
  findSectorById(sectorId: string): Promise<SectorRecord | null>;

  // Incident mutations
  createIncident(input: CreateIncidentInsert): Promise<IncidentRecord>;
  createAlert(input: CreateAlertInsert): Promise<AlertRecord>;
  createAuditLog(input: CreateAuditLogInput): Promise<void>;

  // Transaction support
  runInTransaction<T>(
    operation: (uow: IncidentRepository) => Promise<T>,
  ): Promise<T>;
}
