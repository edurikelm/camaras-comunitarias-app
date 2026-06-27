import { describe, expect, it, vi } from "vitest";
import {
  AuditAction,
  CameraStatus,
  CommunityMemberRole,
  CommunityMemberStatus,
} from "@/generated/prisma/enums";
import { setCameraPermission } from "./set-camera-permission";
import type {
  CameraPermissionRecord,
  CameraRepository,
} from "./camera-repository";

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
    findCommunityById: vi.fn(async () => ({
      id: "community-1",
      name: "Barrio Norte",
      status: "ACTIVE" as const,
    })),
    findActiveNeighborOrGuardMember: vi.fn(async (_communityId, userId) => {
      if (userId === "user-owner-1" || userId === "user-other-1") {
        return {
          id: "member-1",
          userId,
          communityId: "community-1",
          role: CommunityMemberRole.NEIGHBOR,
          status: CommunityMemberStatus.ACTIVE,
        };
      }
      return null;
    }),
    findActiveAdminMember: vi.fn(),
    findSectorById: vi.fn(),
    createAuditLog: vi.fn(),
    runInTransaction: vi.fn(async (op) => op(repository)),
    findPermissionById: vi.fn(),
    findPermissionByCameraAndRole: vi.fn(),
    findPermissionByCameraAndUser: vi.fn(),
    upsertCameraPermission: vi.fn(
      async (
        cameraId,
        input,
      ): Promise<CameraPermissionRecord> => ({
        id: "permission-1",
        cameraId,
        roleAllowed: input.roleAllowed,
        userIdAllowed: input.userIdAllowed,
        canViewLive: input.canViewLive,
        canRequestRecordings: input.canRequestRecordings,
        scheduleStart: input.scheduleStart,
        scheduleEnd: input.scheduleEnd,
      }),
    ),
    deleteCameraPermission: vi.fn(),
    ...overrides,
  };
  return repository;
}

const validInput = {
  actor: { id: "user-owner-1" },
  communityId: "community-1",
  cameraId: "camera-active-1",
  permission: {
    role: CommunityMemberRole.GUARD,
    canViewLive: true,
    canRequestRecordings: false,
  },
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("setCameraPermission", () => {
  it("crea un permiso por rol en una camara ACTIVE y audita", async () => {
    const repository = createRepository();

    const result = await setCameraPermission(validInput, {
      cameraRepository: repository,
    });

    expect(result.permission).toMatchObject({
      id: "permission-1",
      cameraId: "camera-active-1",
      roleAllowed: CommunityMemberRole.GUARD,
      userIdAllowed: null,
      canViewLive: true,
      canRequestRecordings: false,
      scheduleStart: null,
      scheduleEnd: null,
    });

    expect(repository.upsertCameraPermission).toHaveBeenCalledWith(
      "camera-active-1",
      expect.objectContaining({
        roleAllowed: CommunityMemberRole.GUARD,
        userIdAllowed: null,
        canViewLive: true,
        canRequestRecordings: false,
      }),
    );

    expect(repository.createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: AuditAction.CAMERA_PERMISSION_CHANGED,
        entityType: "CameraPermission",
        entityId: "permission-1",
        communityId: "community-1",
        actorId: "user-owner-1",
      }),
    );
  });

  it("crea un permiso por usuario", async () => {
    const repository = createRepository();

    const result = await setCameraPermission(
      {
        ...validInput,
        permission: {
          userId: "00000000-0000-0000-0000-000000000001",
          canViewLive: false,
          canRequestRecordings: true,
        },
      },
      { cameraRepository: repository },
    );

    expect(result.permission).toMatchObject({
      roleAllowed: null,
      userIdAllowed: "00000000-0000-0000-0000-000000000001",
      canViewLive: false,
      canRequestRecordings: true,
    });

    expect(repository.upsertCameraPermission).toHaveBeenCalledWith(
      "camera-active-1",
      expect.objectContaining({
        roleAllowed: null,
        userIdAllowed: "00000000-0000-0000-0000-000000000001",
      }),
    );
  });

  it("crea un permiso con horario valido", async () => {
    const repository = createRepository();

    const result = await setCameraPermission(
      {
        ...validInput,
        permission: {
          role: CommunityMemberRole.NEIGHBOR,
          canViewLive: true,
          canRequestRecordings: true,
          scheduleStart: "09:00",
          scheduleEnd: "17:00",
        },
      },
      { cameraRepository: repository },
    );

    expect(result.permission).toMatchObject({
      scheduleStart: "09:00",
      scheduleEnd: "17:00",
    });
  });

  it("actualiza un permiso existente (upsert)", async () => {
    const repository = createRepository({
      findPermissionByCameraAndRole: vi.fn(async () => ({
        id: "existing-permission-1",
        cameraId: "camera-active-1",
        roleAllowed: CommunityMemberRole.GUARD,
        userIdAllowed: null,
        canViewLive: false,
        canRequestRecordings: false,
        scheduleStart: null,
        scheduleEnd: null,
      })),
    });

    const result = await setCameraPermission(
      {
        ...validInput,
        permission: {
          role: CommunityMemberRole.GUARD,
          canViewLive: true,
          canRequestRecordings: true,
        },
      },
      { cameraRepository: repository },
    );

    // The repository's upsertCameraPermission mock always returns a new permission
    expect(result.permission).toMatchObject({
      canViewLive: true,
      canRequestRecordings: true,
    });

    expect(repository.upsertCameraPermission).toHaveBeenCalledWith(
      "camera-active-1",
      expect.objectContaining({
        roleAllowed: CommunityMemberRole.GUARD,
        canViewLive: true,
        canRequestRecordings: true,
      }),
    );
  });

  it("rechaza si no se especifica ni role ni userId", async () => {
    const repository = createRepository();

    await expect(
      setCameraPermission(
        {
          ...validInput,
          permission: {
            canViewLive: true,
            canRequestRecordings: false,
          } as any,
        },
        { cameraRepository: repository },
      ),
    ).rejects.toThrow("Either role or userId must be specified");

    expect(repository.upsertCameraPermission).not.toHaveBeenCalled();
    expect(repository.createAuditLog).not.toHaveBeenCalled();
  });

  it("rechaza si el role no es un valor valido del enum", async () => {
    const repository = createRepository();

    await expect(
      setCameraPermission(
        {
          ...validInput,
          permission: {
            role: "INVALID" as any,
            canViewLive: true,
            canRequestRecordings: false,
          },
        },
        { cameraRepository: repository },
      ),
    ).rejects.toThrow("Invalid role");

    expect(repository.upsertCameraPermission).not.toHaveBeenCalled();
    expect(repository.createAuditLog).not.toHaveBeenCalled();
  });

  it("rechaza si el userId no es un UUID valido", async () => {
    const repository = createRepository();

    await expect(
      setCameraPermission(
        {
          ...validInput,
          permission: {
            userId: "not-a-uuid",
            canViewLive: true,
            canRequestRecordings: false,
          },
        },
        { cameraRepository: repository },
      ),
    ).rejects.toThrow("userId must be a valid UUID");

    expect(repository.upsertCameraPermission).not.toHaveBeenCalled();
    expect(repository.createAuditLog).not.toHaveBeenCalled();
  });

  it("rechaza si se especifican ambos role y userId", async () => {
    const repository = createRepository();

    await expect(
      setCameraPermission(
        {
          ...validInput,
          permission: {
            role: CommunityMemberRole.GUARD,
            userId: "user-specific-1",
            canViewLive: true,
            canRequestRecordings: false,
          } as any,
        },
        { cameraRepository: repository },
      ),
    ).rejects.toThrow("Cannot specify both role and userId");

    expect(repository.upsertCameraPermission).not.toHaveBeenCalled();
    expect(repository.createAuditLog).not.toHaveBeenCalled();
  });

  it("rechaza si scheduleEnd <= scheduleStart", async () => {
    const repository = createRepository();

    await expect(
      setCameraPermission(
        {
          ...validInput,
          permission: {
            role: CommunityMemberRole.GUARD,
            canViewLive: true,
            canRequestRecordings: false,
            scheduleStart: "17:00",
            scheduleEnd: "09:00",
          },
        },
        { cameraRepository: repository },
      ),
    ).rejects.toThrow("scheduleEnd must be greater than scheduleStart");

    expect(repository.upsertCameraPermission).not.toHaveBeenCalled();
    expect(repository.createAuditLog).not.toHaveBeenCalled();
  });

  it("rechaza scheduleStart con formato invalido", async () => {
    const repository = createRepository();

    await expect(
      setCameraPermission(
        {
          ...validInput,
          permission: {
            role: CommunityMemberRole.GUARD,
            canViewLive: true,
            canRequestRecordings: false,
            scheduleStart: "25:00",
          },
        },
        { cameraRepository: repository },
      ),
    ).rejects.toThrow("scheduleStart must be in HH:MM format");

    expect(repository.upsertCameraPermission).not.toHaveBeenCalled();
  });

  it("rechaza si el actor no es miembro ACTIVE", async () => {
    const repository = createRepository({
      findActiveNeighborOrGuardMember: vi.fn(async () => null),
      findActiveAdminMember: vi.fn(async () => null),
    });

    await expect(
      setCameraPermission(
        { ...validInput, actor: { id: "user-non-member" } },
        { cameraRepository: repository },
      ),
    ).rejects.toThrow("Only an ACTIVE member of the community");

    expect(repository.upsertCameraPermission).not.toHaveBeenCalled();
    expect(repository.createAuditLog).not.toHaveBeenCalled();
  });

  it("rechaza si la camara no existe", async () => {
    const repository = createRepository();

    await expect(
      setCameraPermission(
        { ...validInput, cameraId: "nonexistent" },
        { cameraRepository: repository },
      ),
    ).rejects.toThrow("Camera not found");

    expect(repository.upsertCameraPermission).not.toHaveBeenCalled();
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
      setCameraPermission(validInput, { cameraRepository: repository }),
    ).rejects.toThrow("Camera does not belong to this community");

    expect(repository.upsertCameraPermission).not.toHaveBeenCalled();
    expect(repository.createAuditLog).not.toHaveBeenCalled();
  });

  it("rechaza si la camara no esta ACTIVE", async () => {
    const repository = createRepository();

    await expect(
      setCameraPermission(
        { ...validInput, cameraId: "camera-pending-1" },
        { cameraRepository: repository },
      ),
    ).rejects.toThrow("Camera must be ACTIVE to configure permissions");

    expect(repository.upsertCameraPermission).not.toHaveBeenCalled();
    expect(repository.createAuditLog).not.toHaveBeenCalled();
  });

  it("rechaza si el actor no es el dueno de la camara", async () => {
    const repository = createRepository();

    await expect(
      setCameraPermission(
        { ...validInput, actor: { id: "user-other-1" } },
        { cameraRepository: repository },
      ),
    ).rejects.toThrow("Only the camera owner can set permissions");

    expect(repository.upsertCameraPermission).not.toHaveBeenCalled();
    expect(repository.createAuditLog).not.toHaveBeenCalled();
  });

  it("rechaza si la comunidad no existe", async () => {
    const repository = createRepository({
      findCommunityById: vi.fn(async () => null),
    });

    await expect(
      setCameraPermission(validInput, { cameraRepository: repository }),
    ).rejects.toThrow("Community not found");

    expect(repository.upsertCameraPermission).not.toHaveBeenCalled();
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
      setCameraPermission(validInput, { cameraRepository: repository }),
    ).rejects.toThrow("Community is not active");

    expect(repository.upsertCameraPermission).not.toHaveBeenCalled();
    expect(repository.createAuditLog).not.toHaveBeenCalled();
  });

  it("rechaza communityId vacio", async () => {
    const repository = createRepository();

    await expect(
      setCameraPermission(
        { ...validInput, communityId: "   " },
        { cameraRepository: repository },
      ),
    ).rejects.toThrow("communityId is required");

    expect(repository.runInTransaction).not.toHaveBeenCalled();
  });

  it("rechaza cameraId vacio", async () => {
    const repository = createRepository();

    await expect(
      setCameraPermission(
        { ...validInput, cameraId: "   " },
        { cameraRepository: repository },
      ),
    ).rejects.toThrow("cameraId is required");

    expect(repository.runInTransaction).not.toHaveBeenCalled();
  });
});
