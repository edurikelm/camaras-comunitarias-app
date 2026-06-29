import { describe, expect, it, vi } from "vitest";
import {
  AuditAction,
  CameraStatus,
  CommunityMemberRole,
  CommunityMemberStatus,
} from "@/generated/prisma/enums";
import { reviewCamera } from "./review-camera";
import { CommunityInvariantError } from "@/domain/community/errors";
import type { CameraRepository } from "./camera-repository";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createRepository(
  overrides: Partial<CameraRepository> = {},
): CameraRepository {
  const repository: CameraRepository = {
    findCameraById: vi.fn(async (id) => {
      if (id === "camera-pending-1") {
        return {
          id: "camera-pending-1",
          communityId: "community-1",
          ownerId: "user-neighbor-1",
          sectorId: null,
          name: "Entrada principal",
          description: null,
          approximateLocation: null,
          status: CameraStatus.PENDING_REVIEW,
          technicalStatus: "pendiente",
          reviewNote: null,
        };
      }
      if (id === "camera-active-1") {
        return {
          id: "camera-active-1",
          communityId: "community-1",
          ownerId: "user-neighbor-2",
          sectorId: null,
          name: "Entrada trasera",
          description: null,
          approximateLocation: null,
          status: CameraStatus.ACTIVE,
          technicalStatus: "configurada",
          reviewNote: null,
        };
      }
      if (id === "camera-rejected-1") {
        return {
          id: "camera-rejected-1",
          communityId: "community-1",
          ownerId: "user-neighbor-3",
          sectorId: null,
          name: "Cocina",
          description: null,
          approximateLocation: null,
          status: CameraStatus.REJECTED,
          technicalStatus: null,
          reviewNote: null,
        };
      }
      return null;
    }),
    findCamerasByOwner: vi.fn(),
    findCamerasByCommunity: vi.fn(),
    createCamera: vi.fn(),
    updateCamera: vi.fn(async (id, input) => {
      const baseCamera = await repository.findCameraById(id);
      if (!baseCamera) throw new Error("Camera not found");
      return {
        ...baseCamera,
        status: (input.status ?? baseCamera.status) as CameraStatus,
        technicalStatus:
          input.technicalStatus !== undefined
            ? input.technicalStatus
            : baseCamera.technicalStatus,
        reviewNote:
          input.reviewNote !== undefined
            ? input.reviewNote
            : baseCamera.reviewNote,
      };
    }),
    findCommunityById: vi.fn(async () => ({
      id: "community-1",
      name: "Barrio Norte",
      status: "ACTIVE" as const,
    })),
    findActiveNeighborOrGuardMember: vi.fn(),
    findActiveAdminMember: vi.fn(async () => ({
      id: "member-admin-1",
      userId: "user-admin-1",
      communityId: "community-1",
      role: CommunityMemberRole.ADMIN,
      status: CommunityMemberStatus.ACTIVE,
    })),
    findActiveMember: vi.fn(),
    findActiveAdminOrGuardMember: vi.fn(),
    findSectorById: vi.fn(),
    createAuditLog: vi.fn(),
    runInTransaction: vi.fn(async (op) => op(repository)),
    findPermissionById: vi.fn(),
    findPermissionByCameraAndRole: vi.fn(),
    findPermissionByCameraAndUser: vi.fn(),
    upsertCameraPermission: vi.fn(),
    deleteCameraPermission: vi.fn(),
    ...overrides,
  };
  return repository;
}

const validInput = {
  actor: { id: "user-admin-1" },
  communityId: "community-1",
  cameraId: "camera-pending-1",
  action: "APPROVE" as const,
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("reviewCamera", () => {
  it("aprueba una camara PENDING_REVIEW -> ACTIVE y audita", async () => {
    const repository = createRepository();

    const result = await reviewCamera(validInput, {
      cameraRepository: repository,
    });

    expect(result.camera).toMatchObject({
      id: "camera-pending-1",
      status: CameraStatus.ACTIVE,
      reviewNote: null,
    });

    expect(repository.updateCamera).toHaveBeenCalledWith(
      "camera-pending-1",
      {
        status: CameraStatus.ACTIVE,
        technicalStatus: "configurada",
        reviewNote: null,
      },
    );

    expect(repository.createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: AuditAction.CAMERA_REVIEWED,
        entityType: "Camera",
        entityId: "camera-pending-1",
        communityId: "community-1",
        actorId: "user-admin-1",
      }),
    );
  });

  it("rechaza una camara PENDING_REVIEW -> REJECTED", async () => {
    const repository = createRepository();

    const result = await reviewCamera(
      {
        ...validInput,
        action: "REJECT",
      },
      { cameraRepository: repository },
    );

    expect(result.camera).toMatchObject({
      status: CameraStatus.REJECTED,
    });

    expect(repository.updateCamera).toHaveBeenCalledWith(
      "camera-pending-1",
      {
        status: CameraStatus.REJECTED,
        technicalStatus: null,
        reviewNote: null,
      },
    );
  });

  it("rechaza con reviewNote", async () => {
    const repository = createRepository();

    const result = await reviewCamera(
      {
        ...validInput,
        action: "REJECT",
        reviewNote: "Ubicación no válida para seguridad comunitaria",
      },
      { cameraRepository: repository },
    );

    expect(result.camera).toMatchObject({
      status: CameraStatus.REJECTED,
      reviewNote: "Ubicación no válida para seguridad comunitaria",
    });

    expect(repository.updateCamera).toHaveBeenCalledWith(
      "camera-pending-1",
      {
        status: CameraStatus.REJECTED,
        technicalStatus: null,
        reviewNote: "Ubicación no válida para seguridad comunitaria",
      },
    );
  });

  it("rechaza si el actor no es ADMIN ACTIVE", async () => {
    const repository = createRepository({
      findActiveAdminMember: vi.fn(async () => null),
    });

    await expect(
      reviewCamera(validInput, { cameraRepository: repository }),
    ).rejects.toThrow("Only an ACTIVE ADMIN can review cameras");

    expect(repository.updateCamera).not.toHaveBeenCalled();
    expect(repository.createAuditLog).not.toHaveBeenCalled();
  });

  it("rechaza si la camara no existe", async () => {
    const repository = createRepository({
      findCameraById: vi.fn(async () => null),
    });

    await expect(
      reviewCamera(
        { ...validInput, cameraId: "nonexistent" },
        { cameraRepository: repository },
      ),
    ).rejects.toThrow("Camera not found");

    expect(repository.updateCamera).not.toHaveBeenCalled();
    expect(repository.createAuditLog).not.toHaveBeenCalled();
  });

  it("rechaza si la camara no pertenece a la comunidad", async () => {
    const repository = createRepository({
      findCameraById: vi.fn(async () => ({
        id: "camera-other",
        communityId: "other-community",
        ownerId: "user-neighbor-1",
        sectorId: null,
        name: "Otra cámara",
        description: null,
        approximateLocation: null,
        status: CameraStatus.PENDING_REVIEW,
        technicalStatus: "pendiente",
        reviewNote: null,
      })),
    });

    await expect(
      reviewCamera(validInput, { cameraRepository: repository }),
    ).rejects.toThrow("Camera does not belong to this community");

    expect(repository.updateCamera).not.toHaveBeenCalled();
    expect(repository.createAuditLog).not.toHaveBeenCalled();
  });

  it("rechaza si la camara no esta PENDING_REVIEW (ACTIVE)", async () => {
    const repository = createRepository();

    await expect(
      reviewCamera(
        { ...validInput, cameraId: "camera-active-1" },
        { cameraRepository: repository },
      ),
    ).rejects.toThrow("Camera is not pending review");

    expect(repository.updateCamera).not.toHaveBeenCalled();
    expect(repository.createAuditLog).not.toHaveBeenCalled();
  });

  it("rechaza si la camara no esta PENDING_REVIEW (REJECTED)", async () => {
    const repository = createRepository();

    await expect(
      reviewCamera(
        { ...validInput, cameraId: "camera-rejected-1" },
        { cameraRepository: repository },
      ),
    ).rejects.toThrow("Camera is not pending review");

    expect(repository.updateCamera).not.toHaveBeenCalled();
    expect(repository.createAuditLog).not.toHaveBeenCalled();
  });

  it("rechaza si el ADMIN intenta revisar su propia camara", async () => {
    const repository = createRepository({
      findCameraById: vi.fn(async () => ({
        id: "camera-pending-1",
        communityId: "community-1",
        ownerId: "user-admin-1",
        sectorId: null,
        name: "Mi cámara",
        description: null,
        approximateLocation: null,
        status: CameraStatus.PENDING_REVIEW,
        technicalStatus: "pendiente",
        reviewNote: null,
      })),
    });

    await expect(
      reviewCamera(validInput, { cameraRepository: repository }),
    ).rejects.toThrow("An ADMIN cannot review their own camera");

    expect(repository.updateCamera).not.toHaveBeenCalled();
    expect(repository.createAuditLog).not.toHaveBeenCalled();
  });

  it("rechaza si la comunidad no existe", async () => {
    const repository = createRepository({
      findCommunityById: vi.fn(async () => null),
    });

    await expect(
      reviewCamera(validInput, { cameraRepository: repository }),
    ).rejects.toThrow("Community not found");

    expect(repository.updateCamera).not.toHaveBeenCalled();
    expect(repository.createAuditLog).not.toHaveBeenCalled();
  });

  it("rechaza si la comunidad no esta ACTIVE", async () => {
    const repository = createRepository({
      findCommunityById: vi.fn(async () => ({
        id: "community-1",
        name: "Barrio Norte",
        status: "SUSPENDED" as const,
      })),
    });

    await expect(
      reviewCamera(validInput, { cameraRepository: repository }),
    ).rejects.toThrow("Community is not active");

    expect(repository.updateCamera).not.toHaveBeenCalled();
    expect(repository.createAuditLog).not.toHaveBeenCalled();
  });

  it("rechaza action invalida", async () => {
    const repository = createRepository();

    await expect(
      reviewCamera(
        { ...validInput, action: "INVALID" as "APPROVE" },
        { cameraRepository: repository },
      ),
    ).rejects.toThrow("Action must be APPROVE or REJECT");

    expect(repository.runInTransaction).not.toHaveBeenCalled();
  });

  it("rechaza communityId vacio", async () => {
    const repository = createRepository();

    await expect(
      reviewCamera(
        { ...validInput, communityId: "   " },
        { cameraRepository: repository },
      ),
    ).rejects.toThrow("communityId is required");

    expect(repository.runInTransaction).not.toHaveBeenCalled();
  });

  it("trata reviewNote vacio o whitespace como null", async () => {
    const repository = createRepository();

    // Empty string
    const result1 = await reviewCamera(
      { ...validInput, reviewNote: "" },
      { cameraRepository: repository },
    );
    expect(result1.camera.reviewNote).toBeNull();
    expect(repository.updateCamera).toHaveBeenCalledWith(
      "camera-pending-1",
      expect.objectContaining({ reviewNote: null }),
    );

    // Whitespace only
    vi.mocked(repository.updateCamera).mockClear();
    const result2 = await reviewCamera(
      { ...validInput, reviewNote: "   " },
      { cameraRepository: repository },
    );
    expect(result2.camera.reviewNote).toBeNull();
    expect(repository.updateCamera).toHaveBeenCalledWith(
      "camera-pending-1",
      expect.objectContaining({ reviewNote: null }),
    );
  });

  it("already active camera → error", async () => {
    const repository = createRepository();

    let error: unknown;
    try {
      await reviewCamera(
        { ...validInput, cameraId: "camera-active-1" },
        { cameraRepository: repository },
      );
    } catch (e) {
      error = e;
    }

    expect(error).toBeInstanceOf(CommunityInvariantError);
    expect((error as CommunityInvariantError).message).toBe(
      "Camera is not pending review",
    );

    expect(repository.updateCamera).not.toHaveBeenCalled();
    expect(repository.createAuditLog).not.toHaveBeenCalled();
  });

  it("rechaza cameraId vacio", async () => {
    const repository = createRepository();

    await expect(
      reviewCamera(
        { ...validInput, cameraId: "   " },
        { cameraRepository: repository },
      ),
    ).rejects.toThrow("cameraId is required");

    expect(repository.runInTransaction).not.toHaveBeenCalled();
  });
});
