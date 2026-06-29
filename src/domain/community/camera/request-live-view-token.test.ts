import { describe, expect, it, vi } from "vitest";
import {
  AuditAction,
  CameraStatus,
  CommunityMemberRole,
  CommunityMemberStatus,
} from "@/generated/prisma/enums";
import { requestLiveViewToken } from "./request-live-view-token";
import type { CameraRepository } from "./camera-repository";
import type { LiveStreamTokenIssuer } from "./live-stream-token-issuer";

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
      if (id === "camera-inactive-1") {
        return {
          id: "camera-inactive-1",
          communityId: "community-1",
          ownerId: "user-owner-1",
          sectorId: null,
          name: "Cámara inactiva",
          description: null,
          approximateLocation: null,
          status: CameraStatus.INACTIVE,
          technicalStatus: null,
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
      if (
        userId === "user-neighbor-1" ||
        userId === "user-guard-1" ||
        userId === "user-owner-1"
      ) {
        const role =
          userId === "user-guard-1"
            ? CommunityMemberRole.GUARD
            : CommunityMemberRole.NEIGHBOR;
        return {
          id: "member-1",
          userId,
          communityId: "community-1",
          role,
          status: CommunityMemberStatus.ACTIVE,
        };
      }
      return null;
    }),
    findActiveAdminMember: vi.fn(async (_communityId, userId) => {
      if (userId === "user-admin-1") {
        return {
          id: "member-admin-1",
          userId,
          communityId: "community-1",
          role: CommunityMemberRole.ADMIN,
          status: CommunityMemberStatus.ACTIVE,
        };
      }
      return null;
    }),
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

function createMockIssuer() {
  return {
    issue: vi.fn(async ({ cameraId }: { cameraId: string; userId: string; expiresAt: Date }) => ({
      streamUrl: `https://media.example.com/stream/${cameraId}?token=test-jwt-token`,
      token: "test-jwt-token",
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    })),
  } as unknown as LiveStreamTokenIssuer;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("requestLiveViewToken", () => {
  it("genera token para NEIGHBOR con permiso por rol (canViewLive = true)", async () => {
    const repository = createRepository({
      findPermissionByCameraAndRole: vi.fn(async (_cameraId, role) => {
        if (role === CommunityMemberRole.NEIGHBOR) {
          return {
            id: "permission-1",
            cameraId: "camera-active-1",
            roleAllowed: CommunityMemberRole.NEIGHBOR,
            userIdAllowed: null,
            canViewLive: true,
            canRequestRecordings: false,
            scheduleStart: null,
            scheduleEnd: null,
          };
        }
        return null;
      }),
    });
    const mockIssuer = createMockIssuer();

    const result = await requestLiveViewToken(
      { actor: { id: "user-neighbor-1" }, cameraId: "camera-active-1" },
      { cameraRepository: repository, liveStreamTokenIssuer: mockIssuer },
    );

    expect(result.token).toBe("test-jwt-token");
    expect(result.streamUrl).toBe(
      "https://media.example.com/stream/camera-active-1?token=test-jwt-token",
    );
    expect(result.expiresAt).toBeInstanceOf(Date);
    expect(result.expiresAt.getTime()).toBeGreaterThan(Date.now());

    expect(repository.createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: AuditAction.CAMERA_LIVE_VIEWED,
        entityType: "Camera",
        entityId: "camera-active-1",
        communityId: "community-1",
        actorId: "user-neighbor-1",
      }),
    );
  });

  it("genera token para GUARD con permiso por rol (canViewLive = true)", async () => {
    const repository = createRepository({
      findPermissionByCameraAndRole: vi.fn(async (_cameraId, role) => {
        if (role === CommunityMemberRole.GUARD) {
          return {
            id: "permission-2",
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
    });
    const mockIssuer = createMockIssuer();

    const result = await requestLiveViewToken(
      { actor: { id: "user-guard-1" }, cameraId: "camera-active-1" },
      { cameraRepository: repository, liveStreamTokenIssuer: mockIssuer },
    );

    expect(result.token).toBe("test-jwt-token");
    expect(result.streamUrl).toContain("camera-active-1");
  });

  it("genera token para usuario con permiso por usuario (userIdAllowed)", async () => {
    const repository = createRepository({
      findPermissionByCameraAndUser: vi.fn(async (cameraId, userId) => {
        if (
          cameraId === "camera-active-1" &&
          userId === "user-neighbor-1"
        ) {
          return {
            id: "permission-3",
            cameraId: "camera-active-1",
            roleAllowed: null,
            userIdAllowed: "user-neighbor-1",
            canViewLive: true,
            canRequestRecordings: false,
            scheduleStart: null,
            scheduleEnd: null,
          };
        }
        return null;
      }),
    });
    const mockIssuer = createMockIssuer();

    const result = await requestLiveViewToken(
      { actor: { id: "user-neighbor-1" }, cameraId: "camera-active-1" },
      { cameraRepository: repository, liveStreamTokenIssuer: mockIssuer },
    );

    expect(result.token).toBe("test-jwt-token");
    expect(result.streamUrl).toContain("camera-active-1");
  });

  it("ADMIN de comunidad genera token sin necesidad de permiso configurado", async () => {
    const repository = createRepository();
    const mockIssuer = createMockIssuer();

    const result = await requestLiveViewToken(
      { actor: { id: "user-admin-1" }, cameraId: "camera-active-1" },
      { cameraRepository: repository, liveStreamTokenIssuer: mockIssuer },
    );

    expect(result.token).toBe("test-jwt-token");
    expect(result.streamUrl).toContain("camera-active-1");

    // Should NOT have looked up any permissions
    expect(
      repository.findPermissionByCameraAndRole,
    ).not.toHaveBeenCalled();
    expect(
      repository.findPermissionByCameraAndUser,
    ).not.toHaveBeenCalled();
  });

  it("rechaza si actor no es miembro de la comunidad (no ACTIVE)", async () => {
    const repository = createRepository({
      findActiveNeighborOrGuardMember: vi.fn(async () => null),
      findActiveAdminMember: vi.fn(async () => null),
    });
    const mockIssuer = createMockIssuer();

    await expect(
      requestLiveViewToken(
        { actor: { id: "user-non-member" }, cameraId: "camera-active-1" },
        { cameraRepository: repository, liveStreamTokenIssuer: mockIssuer },
      ),
    ).rejects.toThrow("Only ACTIVE community members can view live streams");

    expect(repository.createAuditLog).not.toHaveBeenCalled();
  });

  it("rechaza si la camara no existe", async () => {
    const repository = createRepository();
    const mockIssuer = createMockIssuer();

    await expect(
      requestLiveViewToken(
        { actor: { id: "user-neighbor-1" }, cameraId: "nonexistent" },
        { cameraRepository: repository, liveStreamTokenIssuer: mockIssuer },
      ),
    ).rejects.toThrow("Camera not found");

    expect(repository.createAuditLog).not.toHaveBeenCalled();
  });

  it("rechaza si la camara no es ACTIVE", async () => {
    const repository = createRepository();
    const mockIssuer = createMockIssuer();

    await expect(
      requestLiveViewToken(
        { actor: { id: "user-neighbor-1" }, cameraId: "camera-inactive-1" },
        { cameraRepository: repository, liveStreamTokenIssuer: mockIssuer },
      ),
    ).rejects.toThrow("Camera is not available for live viewing");

    expect(repository.createAuditLog).not.toHaveBeenCalled();
  });

  it("rechaza si actor no tiene permiso (no ADMIN, no CameraPermission)", async () => {
    const repository = createRepository({
      findPermissionByCameraAndRole: vi.fn(async () => null),
      findPermissionByCameraAndUser: vi.fn(async () => null),
    });
    const mockIssuer = createMockIssuer();

    await expect(
      requestLiveViewToken(
        { actor: { id: "user-neighbor-1" }, cameraId: "camera-active-1" },
        { cameraRepository: repository, liveStreamTokenIssuer: mockIssuer },
      ),
    ).rejects.toThrow(
      "You do not have permission to view this camera's live stream",
    );

    expect(repository.createAuditLog).not.toHaveBeenCalled();
  });

  it("rechaza si permiso existe pero canViewLive = false", async () => {
    const repository = createRepository({
      findPermissionByCameraAndRole: vi.fn(async () => ({
        id: "permission-4",
        cameraId: "camera-active-1",
        roleAllowed: CommunityMemberRole.NEIGHBOR,
        userIdAllowed: null,
        canViewLive: false,
        canRequestRecordings: true,
        scheduleStart: null,
        scheduleEnd: null,
      })),
      findPermissionByCameraAndUser: vi.fn(async () => null),
    });
    const mockIssuer = createMockIssuer();

    await expect(
      requestLiveViewToken(
        { actor: { id: "user-neighbor-1" }, cameraId: "camera-active-1" },
        { cameraRepository: repository, liveStreamTokenIssuer: mockIssuer },
      ),
    ).rejects.toThrow(
      "You do not have permission to view this camera's live stream",
    );

    expect(repository.createAuditLog).not.toHaveBeenCalled();
  });

  describe("schedule (horario)", () => {
    /**
     * Helper: returns a Date with the given local hours and minutes.
     * This ensures getHours()/getMinutes() return the expected values
     * regardless of the test runner's timezone.
     */
    function localDate(hours: number, minutes: number): Date {
      const d = new Date();
      d.setHours(hours, minutes, 0, 0);
      return d;
    }

    it("rechaza si canViewLive = false aun cuando el schedule esta vigente", async () => {
      // Regression test para el guard `canViewLive && isWithinSchedule(...)`.
      // Si en el futuro se elimina el guard `canViewLive &&`, este test falla
      // porque el schedule vigente autorizaria la vista indebidamente.
      // Current local time: 14:00 — schedule 09:00-17:00 (dentro de horario)
      vi.useFakeTimers();
      vi.setSystemTime(localDate(14, 0));

      const repository = createRepository({
        findPermissionByCameraAndRole: vi.fn(async () => ({
          id: "permission-canViewFalse-with-schedule",
          cameraId: "camera-active-1",
          roleAllowed: CommunityMemberRole.NEIGHBOR,
          userIdAllowed: null,
          canViewLive: false,
          canRequestRecordings: true,
          scheduleStart: "09:00",
          scheduleEnd: "17:00",
        })),
        findPermissionByCameraAndUser: vi.fn(async () => null),
      });
      const mockIssuer = createMockIssuer();

      await expect(
        requestLiveViewToken(
          { actor: { id: "user-neighbor-1" }, cameraId: "camera-active-1" },
          { cameraRepository: repository, liveStreamTokenIssuer: mockIssuer },
        ),
      ).rejects.toThrow(
        "You do not have permission to view this camera's live stream",
      );

      expect(repository.createAuditLog).not.toHaveBeenCalled();

      vi.useRealTimers();
    });

    it("rechaza si permiso tiene scheduleStart > hora actual (fuera de horario)", async () => {
      // Current local time: 14:00 — schedule starts at 15:00
      vi.useFakeTimers();
      vi.setSystemTime(localDate(14, 0));

      const repository = createRepository({
        findPermissionByCameraAndRole: vi.fn(async () => ({
          id: "permission-5",
          cameraId: "camera-active-1",
          roleAllowed: CommunityMemberRole.NEIGHBOR,
          userIdAllowed: null,
          canViewLive: true,
          canRequestRecordings: false,
          scheduleStart: "15:00",
          scheduleEnd: "23:00",
        })),
        findPermissionByCameraAndUser: vi.fn(async () => null),
      });
      const mockIssuer = createMockIssuer();

      await expect(
        requestLiveViewToken(
          { actor: { id: "user-neighbor-1" }, cameraId: "camera-active-1" },
          { cameraRepository: repository, liveStreamTokenIssuer: mockIssuer },
        ),
      ).rejects.toThrow(
        "You do not have permission to view this camera's live stream",
      );

      vi.useRealTimers();
    });

    it("rechaza si permiso tiene scheduleEnd < hora actual (fuera de horario)", async () => {
      // Current local time: 09:00 — schedule ends at 08:00
      vi.useFakeTimers();
      vi.setSystemTime(localDate(9, 0));

      const repository = createRepository({
        findPermissionByCameraAndRole: vi.fn(async () => ({
          id: "permission-6",
          cameraId: "camera-active-1",
          roleAllowed: CommunityMemberRole.NEIGHBOR,
          userIdAllowed: null,
          canViewLive: true,
          canRequestRecordings: false,
          scheduleStart: "06:00",
          scheduleEnd: "08:00",
        })),
        findPermissionByCameraAndUser: vi.fn(async () => null),
      });
      const mockIssuer = createMockIssuer();

      await expect(
        requestLiveViewToken(
          { actor: { id: "user-neighbor-1" }, cameraId: "camera-active-1" },
          { cameraRepository: repository, liveStreamTokenIssuer: mockIssuer },
        ),
      ).rejects.toThrow(
        "You do not have permission to view this camera's live stream",
      );

      vi.useRealTimers();
    });

    it("permite si la hora actual esta dentro del rango del schedule", async () => {
      // Current local time: 10:30 — schedule 09:00-17:00
      vi.useFakeTimers();
      vi.setSystemTime(localDate(10, 30));

      const repository = createRepository({
        findPermissionByCameraAndRole: vi.fn(async () => ({
          id: "permission-7",
          cameraId: "camera-active-1",
          roleAllowed: CommunityMemberRole.NEIGHBOR,
          userIdAllowed: null,
          canViewLive: true,
          canRequestRecordings: false,
          scheduleStart: "09:00",
          scheduleEnd: "17:00",
        })),
        findPermissionByCameraAndUser: vi.fn(async () => null),
      });
      const mockIssuer = createMockIssuer();

      const result = await requestLiveViewToken(
        { actor: { id: "user-neighbor-1" }, cameraId: "camera-active-1" },
        { cameraRepository: repository, liveStreamTokenIssuer: mockIssuer },
      );

      expect(result.token).toBe("test-jwt-token");

      vi.useRealTimers();
    });

    it("permite si permiso no tiene schedule (acceso sin restriccion horaria)", async () => {
      const repository = createRepository({
        findPermissionByCameraAndRole: vi.fn(async () => ({
          id: "permission-8",
          cameraId: "camera-active-1",
          roleAllowed: CommunityMemberRole.NEIGHBOR,
          userIdAllowed: null,
          canViewLive: true,
          canRequestRecordings: false,
          scheduleStart: null,
          scheduleEnd: null,
        })),
        findPermissionByCameraAndUser: vi.fn(async () => null),
      });
      const mockIssuer = createMockIssuer();

      const result = await requestLiveViewToken(
        { actor: { id: "user-neighbor-1" }, cameraId: "camera-active-1" },
        { cameraRepository: repository, liveStreamTokenIssuer: mockIssuer },
      );

      expect(result.token).toBe("test-jwt-token");
    });

    it("permite si solo hay scheduleStart (sin scheduleEnd) y hora actual >= start", async () => {
      // Current local time: 10:00 — scheduleStart: "09:00", scheduleEnd: null
      vi.useFakeTimers();
      vi.setSystemTime(localDate(10, 0));

      const repository = createRepository({
        findPermissionByCameraAndRole: vi.fn(async () => ({
          id: "permission-9",
          cameraId: "camera-active-1",
          roleAllowed: CommunityMemberRole.NEIGHBOR,
          userIdAllowed: null,
          canViewLive: true,
          canRequestRecordings: false,
          scheduleStart: "09:00",
          scheduleEnd: null,
        })),
        findPermissionByCameraAndUser: vi.fn(async () => null),
      });
      const mockIssuer = createMockIssuer();

      const result = await requestLiveViewToken(
        { actor: { id: "user-neighbor-1" }, cameraId: "camera-active-1" },
        { cameraRepository: repository, liveStreamTokenIssuer: mockIssuer },
      );

      expect(result.token).toBe("test-jwt-token");

      vi.useRealTimers();
    });

    it("rechaza si solo hay scheduleStart (sin scheduleEnd) y hora actual < start", async () => {
      // Current local time: 07:00 — scheduleStart: "09:00", scheduleEnd: null
      vi.useFakeTimers();
      vi.setSystemTime(localDate(7, 0));

      const repository = createRepository({
        findPermissionByCameraAndRole: vi.fn(async () => ({
          id: "permission-10",
          cameraId: "camera-active-1",
          roleAllowed: CommunityMemberRole.NEIGHBOR,
          userIdAllowed: null,
          canViewLive: true,
          canRequestRecordings: false,
          scheduleStart: "09:00",
          scheduleEnd: null,
        })),
        findPermissionByCameraAndUser: vi.fn(async () => null),
      });
      const mockIssuer = createMockIssuer();

      await expect(
        requestLiveViewToken(
          { actor: { id: "user-neighbor-1" }, cameraId: "camera-active-1" },
          { cameraRepository: repository, liveStreamTokenIssuer: mockIssuer },
        ),
      ).rejects.toThrow(
        "You do not have permission to view this camera's live stream",
      );

      vi.useRealTimers();
    });

    it("permite si solo hay scheduleEnd (sin scheduleStart) y hora actual <= end", async () => {
      // Current local time: 14:00 — scheduleStart: null, scheduleEnd: "18:00"
      vi.useFakeTimers();
      vi.setSystemTime(localDate(14, 0));

      const repository = createRepository({
        findPermissionByCameraAndRole: vi.fn(async () => ({
          id: "permission-11",
          cameraId: "camera-active-1",
          roleAllowed: CommunityMemberRole.NEIGHBOR,
          userIdAllowed: null,
          canViewLive: true,
          canRequestRecordings: false,
          scheduleStart: null,
          scheduleEnd: "18:00",
        })),
        findPermissionByCameraAndUser: vi.fn(async () => null),
      });
      const mockIssuer = createMockIssuer();

      const result = await requestLiveViewToken(
        { actor: { id: "user-neighbor-1" }, cameraId: "camera-active-1" },
        { cameraRepository: repository, liveStreamTokenIssuer: mockIssuer },
      );

      expect(result.token).toBe("test-jwt-token");

      vi.useRealTimers();
    });

    it("rechaza si solo hay scheduleEnd (sin scheduleStart) y hora actual > end", async () => {
      // Current local time: 20:00 — scheduleStart: null, scheduleEnd: "18:00"
      vi.useFakeTimers();
      vi.setSystemTime(localDate(20, 0));

      const repository = createRepository({
        findPermissionByCameraAndRole: vi.fn(async () => ({
          id: "permission-12",
          cameraId: "camera-active-1",
          roleAllowed: CommunityMemberRole.NEIGHBOR,
          userIdAllowed: null,
          canViewLive: true,
          canRequestRecordings: false,
          scheduleStart: null,
          scheduleEnd: "18:00",
        })),
        findPermissionByCameraAndUser: vi.fn(async () => null),
      });
      const mockIssuer = createMockIssuer();

      await expect(
        requestLiveViewToken(
          { actor: { id: "user-neighbor-1" }, cameraId: "camera-active-1" },
          { cameraRepository: repository, liveStreamTokenIssuer: mockIssuer },
        ),
      ).rejects.toThrow(
        "You do not have permission to view this camera's live stream",
      );

      vi.useRealTimers();
    });
  });
});
