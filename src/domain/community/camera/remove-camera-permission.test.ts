import { describe, expect, it, vi } from "vitest";
import {
  AuditAction,
  CameraStatus,
  CommunityMemberRole,
  CommunityStatus,
} from "@/generated/prisma/enums";
import { removeCameraPermission } from "./remove-camera-permission";
import type { CameraRepository } from "./camera-repository";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createRepository(
  overrides: Partial<CameraRepository> = {},
): CameraRepository {
  const repository: CameraRepository = {
    findCameraById: vi.fn(async (id) => {
      if (id === "camera-active-1") {
        return {
          id: "camera-active-1",
          communityId: "community-1",
          ownerId: "user-owner-1",
          sectorId: null,
          name: "Entrada principal",
          description: null,
          approximateLocation: null,
          status: CameraStatus.ACTIVE,
          technicalStatus: "configurada",
          reviewNote: null,
        };
      }
      if (id === "camera-pending-1") {
        return {
          id: "camera-pending-1",
          communityId: "community-1",
          ownerId: "user-owner-1",
          sectorId: null,
          name: "Entrada trasera",
          description: null,
          approximateLocation: null,
          status: CameraStatus.PENDING_REVIEW,
          technicalStatus: "pendiente",
          reviewNote: null,
        };
      }
      return null;
    }),
    findCamerasByOwner: vi.fn(),
    findCamerasByCommunity: vi.fn(),
    createCamera: vi.fn(),
    updateCamera: vi.fn(),
    findCommunityById: vi.fn(async (id) => {
      if (id === "community-1") {
        return { id: "community-1", name: "Barrio Norte", status: CommunityStatus.ACTIVE };
      }
      return null;
    }),
    findActiveNeighborOrGuardMember: vi.fn(
      async (_communityId, _userId) => ({ id: "member-1", userId: _userId, communityId: _communityId, role: "NEIGHBOR", status: "ACTIVE" }),
    ),
    findActiveAdminMember: vi.fn(),
    findSectorById: vi.fn(),
    createAuditLog: vi.fn(),
    runInTransaction: vi.fn(async (op) => op(repository)),
    findPermissionById: vi.fn(async (id) => {
      if (id === "permission-1") {
        return {
          id: "permission-1",
          cameraId: "camera-active-1",
          roleAllowed: CommunityMemberRole.GUARD,
          userIdAllowed: null,
          canViewLive: true,
          canRequestRecordings: false,
          scheduleStart: null,
          scheduleEnd: null,
        };
      }
      return null;
    }),
    findPermissionByCameraAndRole: vi.fn(),
    findPermissionByCameraAndUser: vi.fn(),
    upsertCameraPermission: vi.fn(),
    deleteCameraPermission: vi.fn(async (id) => {
      if (id === "permission-1") return true;
      return false;
    }),
    ...overrides,
  };
  return repository;
}

const validInput = {
  actor: { id: "user-owner-1" },
  communityId: "community-1",
  cameraId: "camera-active-1",
  permissionId: "permission-1",
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("removeCameraPermission", () => {
  it("elimina un permiso existente y audita", async () => {
    const repository = createRepository();

    const result = await removeCameraPermission(validInput, {
      cameraRepository: repository,
    });

    expect(result).toEqual({ deleted: true });

    expect(repository.deleteCameraPermission).toHaveBeenCalledWith(
      "permission-1",
    );

    expect(repository.createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: AuditAction.CAMERA_PERMISSION_CHANGED,
        entityType: "CameraPermission",
        entityId: "permission-1",
        actorId: "user-owner-1",
      }),
    );
  });

  it("rechaza si el actor no es el dueno de la camara", async () => {
    const repository = createRepository();

    await expect(
      removeCameraPermission(
        { ...validInput, actor: { id: "user-other-1" } },
        { cameraRepository: repository },
      ),
    ).rejects.toThrow("Only the camera owner can remove permissions");

    expect(repository.deleteCameraPermission).not.toHaveBeenCalled();
    expect(repository.createAuditLog).not.toHaveBeenCalled();
  });

  it("rechaza si la camara no esta ACTIVE", async () => {
    const repository = createRepository();

    await expect(
      removeCameraPermission(
        { ...validInput, cameraId: "camera-pending-1" },
        { cameraRepository: repository },
      ),
    ).rejects.toThrow("Camera must be ACTIVE to remove permissions");

    expect(repository.deleteCameraPermission).not.toHaveBeenCalled();
    expect(repository.createAuditLog).not.toHaveBeenCalled();
  });

  it("rechaza si la camara no existe", async () => {
    const repository = createRepository();

    await expect(
      removeCameraPermission(
        { ...validInput, cameraId: "nonexistent" },
        { cameraRepository: repository },
      ),
    ).rejects.toThrow("Camera not found");

    expect(repository.deleteCameraPermission).not.toHaveBeenCalled();
    expect(repository.createAuditLog).not.toHaveBeenCalled();
  });

  it("rechaza si el permiso no existe", async () => {
    const repository = createRepository({
      findPermissionById: vi.fn(async () => null),
    });

    await expect(
      removeCameraPermission(
        { ...validInput, permissionId: "nonexistent" },
        { cameraRepository: repository },
      ),
    ).rejects.toThrow("Permission not found");

    expect(repository.deleteCameraPermission).not.toHaveBeenCalled();
    expect(repository.createAuditLog).not.toHaveBeenCalled();
  });

  it("rechaza si el permiso pertenece a otra camara", async () => {
    const repository = createRepository({
      findPermissionById: vi.fn(async () => ({
        id: "permission-other",
        cameraId: "other-camera",
        roleAllowed: CommunityMemberRole.GUARD,
        userIdAllowed: null,
        canViewLive: true,
        canRequestRecordings: false,
        scheduleStart: null,
        scheduleEnd: null,
      })),
    });

    await expect(
      removeCameraPermission(validInput, { cameraRepository: repository }),
    ).rejects.toThrow("Permission does not belong to this camera");

    expect(repository.deleteCameraPermission).not.toHaveBeenCalled();
    expect(repository.createAuditLog).not.toHaveBeenCalled();
  });

  it("rechaza cameraId vacio", async () => {
    const repository = createRepository();

    await expect(
      removeCameraPermission(
        { ...validInput, cameraId: "   " },
        { cameraRepository: repository },
      ),
    ).rejects.toThrow("cameraId is required");

    expect(repository.runInTransaction).not.toHaveBeenCalled();
  });

  it("rechaza permissionId vacio", async () => {
    const repository = createRepository();

    await expect(
      removeCameraPermission(
        { ...validInput, permissionId: "   " },
        { cameraRepository: repository },
      ),
    ).rejects.toThrow("permissionId is required");

    expect(repository.runInTransaction).not.toHaveBeenCalled();
  });

  it("rechaza communityId vacio", async () => {
    const repository = createRepository();

    await expect(
      removeCameraPermission(
        { ...validInput, communityId: "   " },
        { cameraRepository: repository },
      ),
    ).rejects.toThrow("communityId is required");

    expect(repository.runInTransaction).not.toHaveBeenCalled();
  });

  it("rechaza si la comunidad no existe", async () => {
    const repository = createRepository({
      findCommunityById: vi.fn(async () => null),
    });

    await expect(
      removeCameraPermission(validInput, { cameraRepository: repository }),
    ).rejects.toThrow("Community not found");

    expect(repository.deleteCameraPermission).not.toHaveBeenCalled();
    expect(repository.createAuditLog).not.toHaveBeenCalled();
  });

  it("rechaza si la comunidad no esta ACTIVE", async () => {
    const repository = createRepository({
      findCommunityById: vi.fn(async () => ({
        id: "community-1",
        name: "Barrio Norte",
        status: CommunityStatus.SUSPENDED,
      })),
    });

    await expect(
      removeCameraPermission(validInput, { cameraRepository: repository }),
    ).rejects.toThrow("Community is not active");

    expect(repository.deleteCameraPermission).not.toHaveBeenCalled();
    expect(repository.createAuditLog).not.toHaveBeenCalled();
  });

  it("rechaza si el actor no es miembro ACTIVE de la comunidad", async () => {
    const repository = createRepository({
      findActiveNeighborOrGuardMember: vi.fn(async () => null),
      findActiveAdminMember: vi.fn(async () => null),
    });

    await expect(
      removeCameraPermission(validInput, { cameraRepository: repository }),
    ).rejects.toThrow(
      "Only an ACTIVE member of the community can remove camera permissions",
    );

    expect(repository.deleteCameraPermission).not.toHaveBeenCalled();
    expect(repository.createAuditLog).not.toHaveBeenCalled();
  });

  it("rechaza si la camara no pertenece a la comunidad", async () => {
    const repository = createRepository({
      findCameraById: vi.fn(async () => ({
        id: "camera-other",
        communityId: "other-community",
        ownerId: "user-owner-1",
        sectorId: null,
        name: "Otra cámara",
        description: null,
        approximateLocation: null,
        status: CameraStatus.ACTIVE,
        technicalStatus: "configurada",
        reviewNote: null,
      })),
    });

    await expect(
      removeCameraPermission(validInput, { cameraRepository: repository }),
    ).rejects.toThrow("Camera does not belong to this community");

    expect(repository.deleteCameraPermission).not.toHaveBeenCalled();
    expect(repository.createAuditLog).not.toHaveBeenCalled();
  });
});
