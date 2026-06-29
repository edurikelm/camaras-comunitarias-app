import {
  AuditAction,
  CameraStatus,
  IncidentStatus,
  RecordingRequestStatus,
} from "@/generated/prisma/enums";
import type { MembershipLookupsPort } from "@/domain/community/membership/membership-lookups";

// ---------------------------------------------------------------------------
// Record types
// ---------------------------------------------------------------------------

export type IncidentLookupRecord = {
  id: string;
  communityId: string;
  createdById: string;
  status: IncidentStatus;
};

export type CameraLookupRecord = {
  id: string;
  communityId: string;
  ownerId: string;
  status: CameraStatus;
};

export type RecordingRequestRecord = {
  id: string;
  incidentId: string;
  cameraId: string;
  requestedById: string;
  ownerId: string;
  startTime: Date;
  endTime: Date;
  reason: string;
  status: RecordingRequestStatus;
  ownerComment: string | null;
  createdAt: Date;
};

// ---------------------------------------------------------------------------
// Input types
// ---------------------------------------------------------------------------

export type CreateRecordingRequestInsert = {
  incidentId: string;
  cameraId: string;
  requestedById: string;
  ownerId: string;
  startTime: Date;
  endTime: Date;
  reason: string;
  status: RecordingRequestStatus;
};

export type UpdateRecordingRequestInput = {
  status?: RecordingRequestStatus;
  ownerComment?: string | null;
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

export interface RecordingRequestRepository extends MembershipLookupsPort {
  // Lookup queries
  findIncidentById(id: string): Promise<IncidentLookupRecord | null>;
  findCameraById(id: string): Promise<CameraLookupRecord | null>;
  findRecordingRequestById(id: string): Promise<RecordingRequestRecord | null>;

  // Mutations
  createRecordingRequest(input: CreateRecordingRequestInsert): Promise<RecordingRequestRecord>;
  updateRecordingRequest(id: string, input: UpdateRecordingRequestInput): Promise<RecordingRequestRecord>;
  createAuditLog(input: CreateAuditLogInput): Promise<void>;

  // Transaction support
  runInTransaction<T>(
    operation: (uow: RecordingRequestRepository) => Promise<T>,
  ): Promise<T>;
}
