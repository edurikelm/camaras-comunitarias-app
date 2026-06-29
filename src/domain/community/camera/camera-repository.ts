import {
  AuditAction,
  CameraStatus,
  CommunityMemberRole,
} from "@/generated/prisma/enums";
import type { MembershipLookupsPort } from "@/domain/community/membership/membership-lookups";

// ---------------------------------------------------------------------------
// Record types
// ---------------------------------------------------------------------------

export type CameraRecord = {
  id: string;
  communityId: string;
  ownerId: string;
  sectorId: string | null;
  name: string;
  description: string | null;
  approximateLocation: string | null;
  status: CameraStatus;
  technicalStatus: string | null;
  reviewNote: string | null;
};

// ---------------------------------------------------------------------------
// Input types
// ---------------------------------------------------------------------------

export type CreateCameraInput = {
  communityId: string;
  ownerId: string;
  sectorId: string | null;
  name: string;
  description: string | null;
  approximateLocation: string | null;
  status: CameraStatus;
  technicalStatus: string | null;
  /** Raw RTSP URL — the repository handles encryption internally. */
  rtspUrl: string;
  /** Raw stream key — the repository handles hashing internally. */
  streamKey: string | null;
};

export type UpdateCameraInput = {
  status?: CameraStatus;
  technicalStatus?: string | null;
  reviewNote?: string | null;
  name?: string;
  description?: string | null;
  approximateLocation?: string | null;
  sectorId?: string | null;
};

export type CameraPermissionRecord = {
  id: string;
  cameraId: string;
  roleAllowed: CommunityMemberRole | null;
  userIdAllowed: string | null;
  canViewLive: boolean;
  canRequestRecordings: boolean;
  scheduleStart: string | null;
  scheduleEnd: string | null;
};

export type UpsertCameraPermissionInput = {
  roleAllowed: CommunityMemberRole | null;
  userIdAllowed: string | null;
  canViewLive: boolean;
  canRequestRecordings: boolean;
  scheduleStart: string | null;
  scheduleEnd: string | null;
};

export type AuditLogInput = {
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

export interface CameraRepository extends MembershipLookupsPort {
  // Camera queries
  findCameraById(id: string): Promise<CameraRecord | null>;
  findCamerasByOwner(ownerId: string): Promise<CameraRecord[]>;
  findCamerasByCommunity(communityId: string): Promise<CameraRecord[]>;

  // Camera mutations
  createCamera(input: CreateCameraInput): Promise<CameraRecord>;
  updateCamera(id: string, input: UpdateCameraInput): Promise<CameraRecord>;

  // Camera permission queries
  findPermissionById(
    id: string,
  ): Promise<CameraPermissionRecord | null>;
  findPermissionByCameraAndRole(
    cameraId: string,
    role: CommunityMemberRole,
  ): Promise<CameraPermissionRecord | null>;
  findPermissionByCameraAndUser(
    cameraId: string,
    userId: string,
  ): Promise<CameraPermissionRecord | null>;

  // Camera permission mutations
  upsertCameraPermission(
    cameraId: string,
    input: UpsertCameraPermissionInput,
  ): Promise<CameraPermissionRecord>;
  deleteCameraPermission(id: string): Promise<boolean>;
  createAuditLog(input: AuditLogInput): Promise<void>;

  // Transaction support
  runInTransaction<T>(
    operation: (uow: CameraRepository) => Promise<T>,
  ): Promise<T>;
}
