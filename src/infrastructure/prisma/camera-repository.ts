import { randomBytes, createCipheriv, createHash } from "node:crypto";
import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import type { CameraRepository } from "@/domain/community/camera/camera-repository";
import type {
  CameraPermissionRecord,
  CameraRecord,
  CreateCameraInput,
  UpdateCameraInput,
  CommunityLookupRecord,
  MemberLookupRecord,
  SectorLookupRecord,
  AuditLogInput,
  UpsertCameraPermissionInput,
} from "@/domain/community/camera/camera-repository";
import { CameraStatus } from "@/generated/prisma/enums";

// ---------------------------------------------------------------------------
// RTSP encryption helpers
// ---------------------------------------------------------------------------

const AES_ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 16;

function getEncryptionKey(): Buffer {
  const secret = process.env.CAMERA_RTSP_SECRET;
  if (!secret) {
    throw new Error(
      "CAMERA_RTSP_SECRET environment variable is required for RTSP encryption",
    );
  }
  return createHash("sha256").update(secret).digest();
}

/**
 * Encrypts a plaintext RTSP URL using AES-256-GCM.
 * Returns a string in the format `iv:authTag:ciphertext` (all hex).
 */
function encryptRTSP(plaintext: string): string {
  const key = getEncryptionKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(AES_ALGORITHM, key, iv);

  let encrypted = cipher.update(plaintext, "utf8", "hex");
  encrypted += cipher.final("hex");

  const authTag = cipher.getAuthTag().toString("hex");

  return `${iv.toString("hex")}:${authTag}:${encrypted}`;
}

/**
 * Hashes a stream key using SHA-256.
 */
function hashStreamKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

// ---------------------------------------------------------------------------
// CameraRecord mapping
// ---------------------------------------------------------------------------

function toCameraRecord(row: {
  id: string;
  communityId: string;
  ownerId: string;
  sectorId: string | null;
  name: string;
  description: string | null;
  approximateLocation: string | null;
  status: string;
  technicalStatus: string | null;
  reviewNote: string | null;
}): CameraRecord {
  return {
    id: row.id,
    communityId: row.communityId,
    ownerId: row.ownerId,
    sectorId: row.sectorId,
    name: row.name,
    description: row.description,
    approximateLocation: row.approximateLocation,
    status: row.status as CameraStatus,
    technicalStatus: row.technicalStatus,
    reviewNote: row.reviewNote,
  };
}

// ---------------------------------------------------------------------------
// CameraPermissionRecord mapping
// ---------------------------------------------------------------------------

function toCameraPermissionRecord(row: {
  id: string;
  cameraId: string;
  roleAllowed: string | null;
  userIdAllowed: string | null;
  canViewLive: boolean;
  canRequestRecordings: boolean;
  scheduleStart: string | null;
  scheduleEnd: string | null;
}): CameraPermissionRecord {
  return {
    id: row.id,
    cameraId: row.cameraId,
    roleAllowed: row.roleAllowed as CameraPermissionRecord["roleAllowed"],
    userIdAllowed: row.userIdAllowed,
    canViewLive: row.canViewLive,
    canRequestRecordings: row.canRequestRecordings,
    scheduleStart: row.scheduleStart,
    scheduleEnd: row.scheduleEnd,
  };
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createPrismaCameraRepository(
  prisma: PrismaClient,
): CameraRepository {
  function createUnitOfWork(
    tx: Prisma.TransactionClient,
  ): CameraRepository {
    return {
      // -----------------------------------------------------------------------
      // Camera queries
      // -----------------------------------------------------------------------

      async findCameraById(id) {
        const row = await tx.camera.findUnique({
          where: { id },
          select: {
            id: true,
            communityId: true,
            ownerId: true,
            sectorId: true,
            name: true,
            description: true,
            approximateLocation: true,
            status: true,
            technicalStatus: true,
            reviewNote: true,
          },
        });
        return row ? toCameraRecord(row) : null;
      },

      async findCamerasByOwner(ownerId) {
        const rows = await tx.camera.findMany({
          where: { ownerId },
          select: {
            id: true,
            communityId: true,
            ownerId: true,
            sectorId: true,
            name: true,
            description: true,
            approximateLocation: true,
            status: true,
            technicalStatus: true,
            reviewNote: true,
          },
        });
        return rows.map(toCameraRecord);
      },

      async findCamerasByCommunity(communityId) {
        const rows = await tx.camera.findMany({
          where: { communityId },
          select: {
            id: true,
            communityId: true,
            ownerId: true,
            sectorId: true,
            name: true,
            description: true,
            approximateLocation: true,
            status: true,
            technicalStatus: true,
            reviewNote: true,
          },
        });
        return rows.map(toCameraRecord);
      },

      // -----------------------------------------------------------------------
      // Camera mutations
      // -----------------------------------------------------------------------

      async createCamera(input: CreateCameraInput) {
        const rtspUrlEncrypted = encryptRTSP(input.rtspUrl);
        const streamKeyHash = input.streamKey
          ? hashStreamKey(input.streamKey)
          : null;

        const row = await tx.camera.create({
          data: {
            communityId: input.communityId,
            ownerId: input.ownerId,
            sectorId: input.sectorId,
            name: input.name,
            description: input.description,
            approximateLocation: input.approximateLocation,
            status: input.status,
            technicalStatus: input.technicalStatus,
            rtspUrlEncrypted,
            streamKeyHash,
          },
          select: {
            id: true,
            communityId: true,
            ownerId: true,
            sectorId: true,
            name: true,
            description: true,
            approximateLocation: true,
            status: true,
            technicalStatus: true,
            reviewNote: true,
          },
        });
        return toCameraRecord(row);
      },

      async updateCamera(id: string, input: UpdateCameraInput) {
        const updateData: Prisma.CameraUncheckedUpdateInput = {};
        if (input.status !== undefined) updateData.status = input.status;
        if (input.technicalStatus !== undefined)
          updateData.technicalStatus = input.technicalStatus;
        if (input.reviewNote !== undefined)
          updateData.reviewNote = input.reviewNote;
        if (input.name !== undefined) updateData.name = input.name;
        if (input.description !== undefined)
          updateData.description = input.description;
        if (input.approximateLocation !== undefined)
          updateData.approximateLocation = input.approximateLocation;
        if (input.sectorId !== undefined)
          updateData.sectorId = input.sectorId;

        const row = await tx.camera.update({
          where: { id },
          data: updateData,
          select: {
            id: true,
            communityId: true,
            ownerId: true,
            sectorId: true,
            name: true,
            description: true,
            approximateLocation: true,
            status: true,
            technicalStatus: true,
            reviewNote: true,
          },
        });
        return toCameraRecord(row);
      },

      // -----------------------------------------------------------------------
      // Community queries
      // -----------------------------------------------------------------------

      async findCommunityById(id) {
        const row = await tx.community.findUnique({
          where: { id },
          select: { id: true, name: true, status: true },
        });
        return row as CommunityLookupRecord | null;
      },

      async findActiveNeighborOrGuardMember(communityId, userId) {
        const row = await tx.communityMember.findFirst({
          where: {
            userId,
            communityId,
            status: "ACTIVE",
            role: { in: ["NEIGHBOR", "GUARD"] },
          },
          select: {
            id: true,
            userId: true,
            communityId: true,
            role: true,
            status: true,
          },
        });
        return row as MemberLookupRecord | null;
      },

      async findActiveAdminMember(communityId, userId) {
        const row = await tx.communityMember.findFirst({
          where: {
            userId,
            communityId,
            role: "ADMIN",
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
        return row as MemberLookupRecord | null;
      },

      async findSectorById(sectorId) {
        const row = await tx.communitySector.findUnique({
          where: { id: sectorId },
          select: { id: true, communityId: true },
        });
        return row as SectorLookupRecord | null;
      },

      async createAuditLog(input: AuditLogInput) {
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

      // -----------------------------------------------------------------------
      // Camera permission queries
      // -----------------------------------------------------------------------

      async findPermissionById(id) {
        const row = await tx.cameraPermission.findUnique({
          where: { id },
          select: {
            id: true,
            cameraId: true,
            roleAllowed: true,
            userIdAllowed: true,
            canViewLive: true,
            canRequestRecordings: true,
            scheduleStart: true,
            scheduleEnd: true,
          },
        });
        return row ? toCameraPermissionRecord(row) : null;
      },

      async findPermissionByCameraAndRole(cameraId, role) {
        const row = await tx.cameraPermission.findFirst({
          where: { cameraId, roleAllowed: role },
          select: {
            id: true,
            cameraId: true,
            roleAllowed: true,
            userIdAllowed: true,
            canViewLive: true,
            canRequestRecordings: true,
            scheduleStart: true,
            scheduleEnd: true,
          },
        });
        return row ? toCameraPermissionRecord(row) : null;
      },

      async findPermissionByCameraAndUser(cameraId, userId) {
        const row = await tx.cameraPermission.findFirst({
          where: { cameraId, userIdAllowed: userId },
          select: {
            id: true,
            cameraId: true,
            roleAllowed: true,
            userIdAllowed: true,
            canViewLive: true,
            canRequestRecordings: true,
            scheduleStart: true,
            scheduleEnd: true,
          },
        });
        return row ? toCameraPermissionRecord(row) : null;
      },

      // -----------------------------------------------------------------------
      // Camera permission mutations
      // -----------------------------------------------------------------------

      async upsertCameraPermission(cameraId, input) {
        const commonSelect = {
          id: true,
          cameraId: true,
          roleAllowed: true,
          userIdAllowed: true,
          canViewLive: true,
          canRequestRecordings: true,
          scheduleStart: true,
          scheduleEnd: true,
        } as const;

        const commonData = {
          cameraId,
          roleAllowed: input.roleAllowed,
          userIdAllowed: input.userIdAllowed,
          canViewLive: input.canViewLive,
          canRequestRecordings: input.canRequestRecordings,
          scheduleStart: input.scheduleStart,
          scheduleEnd: input.scheduleEnd,
        };

        if (input.roleAllowed) {
          const row = await tx.cameraPermission.upsert({
            where: {
              cameraId_roleAllowed: { cameraId, roleAllowed: input.roleAllowed },
            },
            create: commonData,
            update: commonData,
            select: commonSelect,
          });
          return toCameraPermissionRecord(row);
        }

        if (input.userIdAllowed) {
          const row = await tx.cameraPermission.upsert({
            where: {
              cameraId_userIdAllowed: { cameraId, userIdAllowed: input.userIdAllowed },
            },
            create: commonData,
            update: commonData,
            select: commonSelect,
          });
          return toCameraPermissionRecord(row);
        }

        throw new Error("Either roleAllowed or userIdAllowed must be provided");
      },

      async deleteCameraPermission(id) {
        const existing = await tx.cameraPermission.findUnique({
          where: { id },
          select: { id: true },
        });
        if (!existing) return false;

        await tx.cameraPermission.delete({ where: { id } });
        return true;
      },

      // -----------------------------------------------------------------------
      // Transaction
      // -----------------------------------------------------------------------

      runInTransaction<T>(
        operation: (uow: CameraRepository) => Promise<T>,
      ): Promise<T> {
        // The top-level factory wraps this with prisma.$transaction
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
      operation: (uow: CameraRepository) => Promise<T>,
    ): Promise<T> {
      return prisma.$transaction(async (tx) => {
        const scopedUow = createUnitOfWork(tx);
        return operation(scopedUow);
      });
    },
  };
}
