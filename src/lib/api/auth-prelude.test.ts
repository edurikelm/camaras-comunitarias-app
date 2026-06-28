import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { PlatformRole } from "@/generated/prisma/enums";

// ---------------------------------------------------------------------------
// Hoisted mock factories — these run BEFORE imports due to vi.mock hoisting.
// ---------------------------------------------------------------------------

const { mockAuthenticateRequest } = vi.hoisted(() => ({
  mockAuthenticateRequest: vi.fn<(request: NextRequest) => Promise<{ id: string } | null>>(),
}));

const { mockPrismaFindUnique } = vi.hoisted(() => ({
  mockPrismaFindUnique: vi.fn(),
}));

const mockPrisma = {
  user: { findUnique: mockPrismaFindUnique },
};

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

vi.mock("@/lib/auth", () => ({
  authenticateRequest: mockAuthenticateRequest,
}));

vi.mock("@/lib/prisma", () => ({
  getPrisma: vi.fn(() => mockPrisma),
}));

// ---------------------------------------------------------------------------
// Subject under test
// ---------------------------------------------------------------------------

import {
  requireAuthenticatedUser,
  requirePlatformAdmin,
} from "./auth-prelude";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createRequest(): NextRequest {
  return new NextRequest("http://localhost/api/test", {
    method: "GET",
  });
}

// ---------------------------------------------------------------------------
// requireAuthenticatedUser tests
// ---------------------------------------------------------------------------

describe("requireAuthenticatedUser", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("happy path: retorna ok con actor y prisma singleton", async () => {
    // Arrange
    mockAuthenticateRequest.mockResolvedValue({ id: "auth-1" });
    mockPrismaFindUnique.mockResolvedValue({ id: "user-1" });

    // Act
    const result = await requireAuthenticatedUser(createRequest());

    // Assert
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.actor).toEqual({ id: "user-1" });
      expect(result.prisma).toBe(mockPrisma);
    }
  });

  it("prisma es la misma instancia en llamadas consecutivas (singleton)", async () => {
    // Arrange
    mockAuthenticateRequest.mockResolvedValue({ id: "auth-1" });
    mockPrismaFindUnique.mockResolvedValue({ id: "user-1" });

    // Act
    const result1 = await requireAuthenticatedUser(createRequest());
    const result2 = await requireAuthenticatedUser(createRequest());

    // Assert
    expect(result1.ok).toBe(true);
    expect(result2.ok).toBe(true);
    if (result1.ok && result2.ok) {
      expect(result1.prisma).toBe(result2.prisma);
    }
  });

  it("401 sin sesion: authenticateRequest devuelve null", async () => {
    // Arrange
    mockAuthenticateRequest.mockResolvedValue(null);

    // Act
    const result = await requireAuthenticatedUser(createRequest());

    // Assert
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.response.status).toBe(401);
      const body = await result.response.json();
      expect(body).toEqual({ error: "Unauthorized" });
    }
  });

  it("findUnique no se llama si authenticateRequest devuelve null (rechazo temprano)", async () => {
    // Arrange
    mockAuthenticateRequest.mockResolvedValue(null);

    // Act
    await requireAuthenticatedUser(createRequest());

    // Assert
    expect(mockPrismaFindUnique).not.toHaveBeenCalled();
  });

  it("403 sin User local: findUnique devuelve null", async () => {
    // Arrange
    mockAuthenticateRequest.mockResolvedValue({ id: "auth-1" });
    mockPrismaFindUnique.mockResolvedValue(null);

    // Act
    const result = await requireAuthenticatedUser(createRequest());

    // Assert
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.response.status).toBe(403);
      const body = await result.response.json();
      expect(body).toEqual({ error: "Forbidden" });
    }
  });

  it("select exacto en requireAuthenticatedUser: solo id, sin platformRole", async () => {
    // Arrange
    mockAuthenticateRequest.mockResolvedValue({ id: "auth-1" });
    mockPrismaFindUnique.mockResolvedValue({ id: "user-1" });

    // Act
    await requireAuthenticatedUser(createRequest());

    // Assert
    expect(mockPrismaFindUnique).toHaveBeenCalledTimes(1);
    const call = mockPrismaFindUnique.mock.calls[0][0];
    expect(call.where).toEqual({ authProviderId: "auth-1" });
    expect(call.select).toEqual({ id: true });
    // platformRole must NOT be in the select
    expect(call.select).not.toHaveProperty("platformRole");
  });
});

// ---------------------------------------------------------------------------
// requirePlatformAdmin tests
// ---------------------------------------------------------------------------

describe("requirePlatformAdmin", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("happy path: retorna ok con actor.id y actor.platformRole = PLATFORM_ADMIN", async () => {
    // Arrange
    mockAuthenticateRequest.mockResolvedValue({ id: "auth-1" });
    mockPrismaFindUnique.mockResolvedValue({
      id: "user-1",
      platformRole: PlatformRole.PLATFORM_ADMIN,
    });

    // Act
    const result = await requirePlatformAdmin(createRequest());

    // Assert
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.actor).toEqual({
        id: "user-1",
        platformRole: PlatformRole.PLATFORM_ADMIN,
      });
      expect(result.prisma).toBe(mockPrisma);
    }
  });

  it("403 sin User local: findUnique devuelve null", async () => {
    // Arrange
    mockAuthenticateRequest.mockResolvedValue({ id: "auth-1" });
    mockPrismaFindUnique.mockResolvedValue(null);

    // Act
    const result = await requirePlatformAdmin(createRequest());

    // Assert
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.response.status).toBe(403);
      const body = await result.response.json();
      expect(body).toEqual({ error: "Forbidden" });
    }
  });

  it("403 con platformRole null (campo presente pero null)", async () => {
    // Arrange
    mockAuthenticateRequest.mockResolvedValue({ id: "auth-1" });
    mockPrismaFindUnique.mockResolvedValue({
      id: "user-1",
      platformRole: null,
    });

    // Act
    const result = await requirePlatformAdmin(createRequest());

    // Assert
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.response.status).toBe(403);
    }
  });

  it("403 con platformRole distinto de PLATFORM_ADMIN (defensivo)", async () => {
    // Arrange
    mockAuthenticateRequest.mockResolvedValue({ id: "auth-1" });
    // Simular un valor no valido cualquier otro valor que no sea PLATFORM_ADMIN
    mockPrismaFindUnique.mockResolvedValue({
      id: "user-1",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      platformRole: "SOME_OTHER_ROLE" as any,
    });

    // Act
    const result = await requirePlatformAdmin(createRequest());

    // Assert
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.response.status).toBe(403);
    }
  });

  it("select exacto en requirePlatformAdmin: id y platformRole", async () => {
    // Arrange
    mockAuthenticateRequest.mockResolvedValue({ id: "auth-1" });
    mockPrismaFindUnique.mockResolvedValue({
      id: "user-1",
      platformRole: PlatformRole.PLATFORM_ADMIN,
    });

    // Act
    await requirePlatformAdmin(createRequest());

    // Assert
    expect(mockPrismaFindUnique).toHaveBeenCalledTimes(1);
    const call = mockPrismaFindUnique.mock.calls[0][0];
    expect(call.where).toEqual({ authProviderId: "auth-1" });
    expect(call.select).toEqual({ id: true, platformRole: true });
  });
});
