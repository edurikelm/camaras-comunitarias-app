import { describe, expect, it, vi } from "vitest";
import {
  AuditAction,
  CameraStatus,
  CommunityMemberRole,
  CommunityMemberStatus,
} from "@/generated/prisma/enums";
import { registerCommunityCamera } from "./register-community-camera";
import type { CameraRepository } from "./camera-repository";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createRepository(
  overrides: Partial<CameraRepository> = {},
): CameraRepository {
  const repository: CameraRepository = {
    findCameraById: vi.fn(),
    findCamerasByOwner: vi.fn(),
    findCamerasByCommunity: vi.fn(),
    createCamera: vi.fn(async (input) => ({
      id: "camera-1",
      communityId: input.communityId,
      ownerId: input.ownerId,
      sectorId: input.sectorId,
      name: input.name,
      description: input.description,
      approximateLocation: input.approximateLocation,
      status: CameraStatus.PENDING_REVIEW,
      technicalStatus: input.technicalStatus,
      reviewNote: null,
    })),
    updateCamera: vi.fn(),
    findCommunityById: vi.fn(async () => ({
      id: "community-1",
      name: "Barrio Norte",
      status: "ACTIVE" as const,
    })),
    findActiveNeighborOrGuardMember: vi.fn(async (communityId, userId) => {
      if (userId === "user-neighbor-1") {
        return {
          id: "member-1",
          userId: "user-neighbor-1",
          communityId: "community-1",
          role: CommunityMemberRole.NEIGHBOR,
          status: CommunityMemberStatus.ACTIVE,
        };
      }
      if (userId === "user-guard-1") {
        return {
          id: "member-2",
          userId: "user-guard-1",
          communityId: "community-1",
          role: CommunityMemberRole.GUARD,
          status: CommunityMemberStatus.ACTIVE,
        };
      }
      return null;
    }),
    findActiveAdminMember: vi.fn(),
    findSectorById: vi.fn(async () => ({
      id: "sector-1",
      communityId: "community-1",
    })),
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
  actor: { id: "user-neighbor-1" },
  communityId: "community-1",
  name: "Entrada principal",
  rtspUrl: "rtsp://192.168.1.100:554/stream1",
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("registerCommunityCamera", () => {
  it("registra una camara como NEIGHBOR, status PENDING_REVIEW y audita", async () => {
    const repository = createRepository();

    const result = await registerCommunityCamera(validInput, {
      cameraRepository: repository,
    });

    expect(result.camera).toMatchObject({
      id: "camera-1",
      communityId: "community-1",
      ownerId: "user-neighbor-1",
      name: "Entrada principal",
      status: CameraStatus.PENDING_REVIEW,
    });

    expect(repository.createCamera).toHaveBeenCalledWith(
      expect.objectContaining({
        communityId: "community-1",
        ownerId: "user-neighbor-1",
        name: "Entrada principal",
        rtspUrl: "rtsp://192.168.1.100:554/stream1",
        status: CameraStatus.PENDING_REVIEW,
        technicalStatus: "pendiente",
      }),
    );

    expect(repository.createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: AuditAction.CAMERA_CREATED,
        entityType: "Camera",
        entityId: "camera-1",
        communityId: "community-1",
        actorId: "user-neighbor-1",
      }),
    );
  });

  it("registra una camara como GUARD", async () => {
    const repository = createRepository();

    const result = await registerCommunityCamera(
      { ...validInput, actor: { id: "user-guard-1" } },
      { cameraRepository: repository },
    );

    expect(result.camera).toMatchObject({
      ownerId: "user-guard-1",
      status: CameraStatus.PENDING_REVIEW,
    });

    expect(repository.createAuditLog).toHaveBeenCalled();
  });

  it("registra una camara con campos opcionales", async () => {
    const repository = createRepository();

    const result = await registerCommunityCamera(
      {
        ...validInput,
        description: "Cámara de la entrada principal",
        approximateLocation: "Esquina norte",
        sectorId: "sector-1",
        streamKey: "my-secret-key-123",
      },
      { cameraRepository: repository },
    );

    expect(result.camera).toMatchObject({
      id: "camera-1",
      name: "Entrada principal",
      status: CameraStatus.PENDING_REVIEW,
    });

    expect(repository.createCamera).toHaveBeenCalledWith(
      expect.objectContaining({
        description: "Cámara de la entrada principal",
        approximateLocation: "Esquina norte",
        sectorId: "sector-1",
        streamKey: "my-secret-key-123",
      }),
    );
  });

  it("rechaza si el actor no es miembro ACTIVE", async () => {
    const repository = createRepository({
      findActiveNeighborOrGuardMember: vi.fn(async () => null),
      findActiveAdminMember: vi.fn(async () => null),
    });

    await expect(
      registerCommunityCamera(
        { ...validInput, actor: { id: "user-non-member" } },
        { cameraRepository: repository },
      ),
    ).rejects.toThrow(
      "Only an ACTIVE NEIGHBOR, GUARD, or ADMIN can register a camera",
    );

    expect(repository.createCamera).not.toHaveBeenCalled();
    expect(repository.createAuditLog).not.toHaveBeenCalled();
  });

  it("registra una camara como ADMIN", async () => {
    const repository = createRepository({
      findActiveNeighborOrGuardMember: vi.fn(async () => null),
      findActiveAdminMember: vi.fn(async () => ({
        id: "member-admin-1",
        userId: "user-admin-1",
        communityId: "community-1",
        role: "ADMIN",
        status: "ACTIVE",
      })),
    });

    const result = await registerCommunityCamera(
      { ...validInput, actor: { id: "user-admin-1" } },
      { cameraRepository: repository },
    );

    expect(result.camera).toMatchObject({
      ownerId: "user-admin-1",
      status: CameraStatus.PENDING_REVIEW,
    });

    expect(repository.createAuditLog).toHaveBeenCalled();
  });

  it("rechaza si la comunidad no existe", async () => {
    const repository = createRepository({
      findCommunityById: vi.fn(async () => null),
    });

    await expect(
      registerCommunityCamera(validInput, { cameraRepository: repository }),
    ).rejects.toThrow("Community not found");

    expect(repository.createCamera).not.toHaveBeenCalled();
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
      registerCommunityCamera(validInput, { cameraRepository: repository }),
    ).rejects.toThrow("Community is not active");

    expect(repository.createCamera).not.toHaveBeenCalled();
    expect(repository.createAuditLog).not.toHaveBeenCalled();
  });

  it("rechaza rtspUrl invalida", async () => {
    const repository = createRepository();

    await expect(
      registerCommunityCamera(
        { ...validInput, rtspUrl: "http://example.com/stream" },
        { cameraRepository: repository },
      ),
    ).rejects.toThrow("A valid RTSP URL starting with rtsp:// is required");

    expect(repository.createCamera).not.toHaveBeenCalled();
    expect(repository.createAuditLog).not.toHaveBeenCalled();
  });

  it("rechaza rtspUrl vacia", async () => {
    const repository = createRepository();

    await expect(
      registerCommunityCamera(
        { ...validInput, rtspUrl: "   " },
        { cameraRepository: repository },
      ),
    ).rejects.toThrow("A valid RTSP URL starting with rtsp:// is required");

    expect(repository.runInTransaction).not.toHaveBeenCalled();
  });

  it("rechaza name vacio", async () => {
    const repository = createRepository();

    await expect(
      registerCommunityCamera(
        { ...validInput, name: "   " },
        { cameraRepository: repository },
      ),
    ).rejects.toThrow("Camera name is required");

    expect(repository.runInTransaction).not.toHaveBeenCalled();
  });

  it("rechaza streamKey menor a 8 caracteres", async () => {
    const repository = createRepository();

    await expect(
      registerCommunityCamera(
        { ...validInput, streamKey: "short" },
        { cameraRepository: repository },
      ),
    ).rejects.toThrow("Stream key must be at least 8 characters");

    expect(repository.createCamera).not.toHaveBeenCalled();
    expect(repository.createAuditLog).not.toHaveBeenCalled();
  });

  it("rechaza streamKey con solo espacios en blanco", async () => {
    const repository = createRepository();

    await expect(
      registerCommunityCamera(
        { ...validInput, streamKey: "        " },
        { cameraRepository: repository },
      ),
    ).rejects.toThrow("Stream key must be at least 8 characters");

    expect(repository.createCamera).not.toHaveBeenCalled();
    expect(repository.createAuditLog).not.toHaveBeenCalled();
  });

  it("rechaza sectorId que no pertenece a la comunidad", async () => {
    const repository = createRepository({
      findSectorById: vi.fn(async () => ({
        id: "sector-other",
        communityId: "other-community",
      })),
    });

    await expect(
      registerCommunityCamera(
        { ...validInput, sectorId: "sector-other" },
        { cameraRepository: repository },
      ),
    ).rejects.toThrow("Sector does not belong to this community");

    expect(repository.createCamera).not.toHaveBeenCalled();
    expect(repository.createAuditLog).not.toHaveBeenCalled();
  });

  it("rechaza communityId vacio", async () => {
    const repository = createRepository();

    await expect(
      registerCommunityCamera(
        { ...validInput, communityId: "   " },
        { cameraRepository: repository },
      ),
    ).rejects.toThrow("communityId is required");

    expect(repository.runInTransaction).not.toHaveBeenCalled();
  });
});
