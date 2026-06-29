import {
  AuditAction,
  IncidentStatus,
  IncidentType,
  AlertSeverity,
} from "@/generated/prisma/enums";
import type { MembershipLookupsPort } from "@/domain/community/membership/membership-lookups";

// ---------------------------------------------------------------------------
// Record types
// ---------------------------------------------------------------------------

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

export interface IncidentRepository extends MembershipLookupsPort {
  // Incident mutations
  createIncident(input: CreateIncidentInsert): Promise<IncidentRecord>;
  createAlert(input: CreateAlertInsert): Promise<AlertRecord>;
  createAuditLog(input: CreateAuditLogInput): Promise<void>;

  // Transaction support
  runInTransaction<T>(
    operation: (uow: IncidentRepository) => Promise<T>,
  ): Promise<T>;
}
