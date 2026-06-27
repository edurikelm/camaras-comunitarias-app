import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ---------------------------------------------------------------------------
// Hoisted mock factories — these run BEFORE imports due to vi.mock hoisting.
// ---------------------------------------------------------------------------

const { mockAuthenticateRequest } = vi.hoisted(() => {
  return {
    mockAuthenticateRequest: vi.fn<(request: NextRequest) => Promise<{ id: string } | null>>(),
  };
});

const { mockPrismaFindUnique } = vi.hoisted(() => ({
  mockPrismaFindUnique: vi.fn(),
}));

const {
  mockCreateCommunityWithFirstAdmin,
  MockPlatformAuthorizationError,
  MockCommunityCreationInvariantError,
  mockPrismaTransaction,
} = vi.hoisted(() => {
  class PlatformAuthError extends Error {
    override name = "PlatformAuthorizationError";
    constructor(m = "Only PLATFORM_ADMIN can create communities") {
      super(m);
    }
  }

  class CommunityInvariantError extends Error {
    override name = "CommunityCreationInvariantError";
    constructor(m: string) {
      super(m);
    }
  }

  return {
    mockCreateCommunityWithFirstAdmin: vi.fn(),
    MockPlatformAuthorizationError: PlatformAuthError,
    MockCommunityCreationInvariantError: CommunityInvariantError,
    mockPrismaTransaction: vi.fn(),
  };
});

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

vi.mock("@/lib/auth", () => ({
  authenticateRequest: mockAuthenticateRequest,
}));

vi.mock("@/lib/prisma", () => ({
  getPrisma: vi.fn(() => ({
    user: { findUnique: mockPrismaFindUnique },
    $transaction: mockPrismaTransaction,
  })),
}));

vi.mock("@/infrastructure/prisma/platform-community-repository", () => ({
  createPrismaPlatformCommunityRepository: vi.fn(() => ({
    runInTransaction: vi.fn((op: (uow: unknown) => unknown) => op({})),
    createCommunity: vi.fn(),
    upsertUserByAuthProviderId: vi.fn(),
    findCommunityMemberByUserId: vi.fn(),
    createCommunityMember: vi.fn(),
    createAuditLog: vi.fn(),
  })),
}));

vi.mock("@/domain/platform/create-community-with-first-admin", () => ({
  createCommunityWithFirstAdmin: mockCreateCommunityWithFirstAdmin,
  PlatformAuthorizationError: MockPlatformAuthorizationError,
  CommunityCreationInvariantError: MockCommunityCreationInvariantError,
}));

// ---------------------------------------------------------------------------
// Subject under test
// ---------------------------------------------------------------------------

import { POST } from "./route";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createRequest(body?: unknown): NextRequest {
  return new NextRequest("http://localhost/api/platform/communities", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
}

const validBody = {
  community: { name: "Barrio Norte", address: "Av. Principal 123" },
  firstAdmin: {
    authProviderId: "11111111-1111-1111-1111-111111111111",
    email: "admin@comunidad.cl",
    name: "Admin Uno",
  },
};

const successResult = {
  community: { id: "c1", name: "Barrio Norte", address: "Av. Principal 123", status: "ACTIVE" },
  firstAdminUser: {
    id: "u1",
    authProviderId: "11111111-1111-1111-1111-111111111111",
    email: "admin@comunidad.cl",
    name: "Admin Uno",
    platformRole: null,
  },
  firstAdminMember: {
    id: "m1",
    userId: "u1",
    communityId: "c1",
    role: "ADMIN",
    status: "ACTIVE",
  },
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("POST /api/platform/communities", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("responde 201 cuando un PLATFORM_ADMIN crea una comunidad exitosamente", async () => {
    // Arrange
    mockAuthenticateRequest.mockResolvedValue({ id: "admin-auth-id" });
    mockPrismaFindUnique.mockResolvedValue({
      id: "platform-user-id",
      platformRole: "PLATFORM_ADMIN",
    });
    mockCreateCommunityWithFirstAdmin.mockResolvedValue(successResult);

    // Act
    const response = await POST(createRequest(validBody));
    const body = await response.json();

    // Assert
    expect(response.status).toBe(201);
    expect(body).toEqual({ data: successResult });
  });

  it("responde 401 cuando no hay sesión de Supabase", async () => {
    // Arrange
    mockAuthenticateRequest.mockResolvedValue(null);

    // Act
    const response = await POST(createRequest(validBody));
    const body = await response.json();

    // Assert
    expect(response.status).toBe(401);
    expect(body.error).toBe("Unauthorized");
  });

  it("responde 401 cuando Supabase devuelve error de autenticación", async () => {
    // Arrange
    mockAuthenticateRequest.mockResolvedValue(null);

    // Act
    const response = await POST(createRequest(validBody));
    const body = await response.json();

    // Assert
    expect(response.status).toBe(401);
    expect(body.error).toBe("Unauthorized");
  });

  it("responde 403 cuando el usuario no existe en Prisma", async () => {
    // Arrange
    mockAuthenticateRequest.mockResolvedValue({ id: "some-auth-id" });
    mockPrismaFindUnique.mockResolvedValue(null);

    // Act
    const response = await POST(createRequest(validBody));
    const body = await response.json();

    // Assert
    expect(response.status).toBe(403);
    expect(body.error).toBe("Forbidden");
  });

  it("responde 403 cuando el usuario no es PLATFORM_ADMIN", async () => {
    // Arrange
    mockAuthenticateRequest.mockResolvedValue({ id: "admin-auth-id" });
    mockPrismaFindUnique.mockResolvedValue({
      id: "user-id",
      platformRole: null,
    });

    // Act
    const response = await POST(createRequest(validBody));
    const body = await response.json();

    // Assert
    expect(response.status).toBe(403);
    expect(body.error).toBe("Forbidden");
  });

  it("responde 400 cuando el dominio lanza CommunityCreationInvariantError", async () => {
    // Arrange
    mockAuthenticateRequest.mockResolvedValue({ id: "admin-auth-id" });
    mockPrismaFindUnique.mockResolvedValue({
      id: "platform-user-id",
      platformRole: "PLATFORM_ADMIN",
    });
    mockCreateCommunityWithFirstAdmin.mockRejectedValue(
      new MockCommunityCreationInvariantError("Community name is required"),
    );

    // Act
    const response = await POST(createRequest(validBody));
    const body = await response.json();

    // Assert
    expect(response.status).toBe(400);
    expect(body.error).toBe("Community name is required");
  });

  it("responde 403 cuando el dominio lanza PlatformAuthorizationError", async () => {
    // Arrange
    mockAuthenticateRequest.mockResolvedValue({ id: "admin-auth-id" });
    mockPrismaFindUnique.mockResolvedValue({
      id: "platform-user-id",
      platformRole: "PLATFORM_ADMIN",
    });
    mockCreateCommunityWithFirstAdmin.mockRejectedValue(
      new MockPlatformAuthorizationError("Only PLATFORM_ADMIN can create communities"),
    );

    // Act
    const response = await POST(createRequest(validBody));
    const body = await response.json();

    // Assert
    expect(response.status).toBe(403);
    expect(body.error).toBe("Only PLATFORM_ADMIN can create communities");
  });

  it("responde 500 para errores inesperados del dominio", async () => {
    // Arrange
    mockAuthenticateRequest.mockResolvedValue({ id: "admin-auth-id" });
    mockPrismaFindUnique.mockResolvedValue({
      id: "platform-user-id",
      platformRole: "PLATFORM_ADMIN",
    });
    mockCreateCommunityWithFirstAdmin.mockRejectedValue(new Error("Database connection lost"));

    // Act
    const response = await POST(createRequest(validBody));
    const body = await response.json();

    // Assert
    expect(response.status).toBe(500);
    expect(body.error).toBe("Internal server error");
  });

  it("responde 400 cuando falta community.name en el body", async () => {
    // Arrange
    mockAuthenticateRequest.mockResolvedValue({ id: "admin-auth-id" });
    mockPrismaFindUnique.mockResolvedValue({
      id: "platform-user-id",
      platformRole: "PLATFORM_ADMIN",
    });

    // Act
    const response = await POST(createRequest({ community: {}, firstAdmin: validBody.firstAdmin }));
    const body = await response.json();

    // Assert
    expect(response.status).toBe(400);
    expect(body.error).toBe("community.name is required and must be a string");
    expect(mockCreateCommunityWithFirstAdmin).not.toHaveBeenCalled();
  });

  it("responde 400 cuando falta firstAdmin.authProviderId en el body", async () => {
    // Arrange
    mockAuthenticateRequest.mockResolvedValue({ id: "admin-auth-id" });
    mockPrismaFindUnique.mockResolvedValue({
      id: "platform-user-id",
      platformRole: "PLATFORM_ADMIN",
    });

    // Act
    const response = await POST(
      createRequest({
        community: { name: "Test" },
        firstAdmin: { email: "test@test.cl" },
      }),
    );
    const body = await response.json();

    // Assert
    expect(response.status).toBe(400);
    expect(body.error).toBe("firstAdmin.authProviderId is required");
  });

  it("responde 400 cuando falta firstAdmin.email en el body", async () => {
    // Arrange
    mockAuthenticateRequest.mockResolvedValue({ id: "admin-auth-id" });
    mockPrismaFindUnique.mockResolvedValue({
      id: "platform-user-id",
      platformRole: "PLATFORM_ADMIN",
    });

    // Act
    const response = await POST(
      createRequest({
        community: { name: "Test" },
        firstAdmin: { authProviderId: "11111111-1111-1111-1111-111111111111" },
      }),
    );
    const body = await response.json();

    // Assert
    expect(response.status).toBe(400);
    expect(body.error).toBe("firstAdmin.email is required");
  });

  it("responde 500 cuando el body no es JSON valido", async () => {
    // Arrange
    mockAuthenticateRequest.mockResolvedValue({ id: "admin-auth-id" });
    mockPrismaFindUnique.mockResolvedValue({
      id: "platform-user-id",
      platformRole: "PLATFORM_ADMIN",
    });

    // Act
    const request = new NextRequest("http://localhost/api/platform/communities", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "esto no es json",
    });
    const response = await POST(request);
    const body = await response.json();

    // Assert
    expect(response.status).toBe(500);
    expect(body.error).toBe("Internal server error");
  });
});
