import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import { CommunityMemberRole } from "@/generated/prisma/enums";

// ---------------------------------------------------------------------------
// Hoisted mock factories
// ---------------------------------------------------------------------------

const { mockRequireAuthenticatedUser } = vi.hoisted(() => ({
  mockRequireAuthenticatedUser: vi.fn<
    (request: NextRequest) => Promise<{
      ok: boolean;
      actor?: { id: string };
      response?: NextResponse;
      prisma?: unknown;
    }>
  >(),
}));

const { mockRegisterCommunityCamera } = vi.hoisted(() => ({
  mockRegisterCommunityCamera: vi.fn(),
}));

const { mockCreatePrismaCameraRepository } = vi.hoisted(() => ({
  mockCreatePrismaCameraRepository: vi.fn(),
}));

const { mockCreatePrismaAuditLogAdapter } = vi.hoisted(() => ({
  mockCreatePrismaAuditLogAdapter: vi.fn(),
}));

const { mockCreateRtspCipherFromEnv } = vi.hoisted(() => ({
  mockCreateRtspCipherFromEnv: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

vi.mock("@/lib/api/auth-prelude", () => ({
  requireAuthenticatedUser: mockRequireAuthenticatedUser,
}));

vi.mock("@/infrastructure/prisma/camera-repository", () => ({
  createPrismaCameraRepository: mockCreatePrismaCameraRepository,
}));

vi.mock("@/infrastructure/prisma/audit-log-adapter", () => ({
  createPrismaAuditLogAdapter: mockCreatePrismaAuditLogAdapter,
}));

vi.mock("@/infrastructure/security", () => ({
  createRtspCipherFromEnv: mockCreateRtspCipherFromEnv,
}));

// Preserve real domain error classes for instanceof checks
vi.mock("@/domain/community/camera/register-community-camera", async () => {
  const actual = await vi.importActual<
    typeof import("@/domain/community/camera/register-community-camera")
  >("@/domain/community/camera/register-community-camera");
  return {
    ...actual,
    registerCommunityCamera: mockRegisterCommunityCamera,
  };
});

// ---------------------------------------------------------------------------
// Subject under test
// ---------------------------------------------------------------------------

import { POST } from "./route";
import {
  CommunityAuthorizationError,
  CommunityInvariantError,
  CommunityNotFoundError,
} from "@/domain/community/errors";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createRequest(body?: unknown): NextRequest {
  return new NextRequest(
    `http://localhost/api/communities/${COMMUNITY_ID}/cameras`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    },
  );
}

const validBody = {
  name: "Camara entrada principal",
  rtspUrl: "rtsp://192.168.1.100:554/stream",
  description: "Camara del frente de la casa",
  approximateLocation: "Esquina Av. Principal",
  sectorId: "33333333-3333-3333-3333-333333333333",
  streamKey: "mystreamkey123",
};

const successCameraResult = {
  camera: {
    id: "cam-1",
    communityId: "22222222-2222-2222-2222-222222222222",
    ownerId: "user-1",
    name: "Camara entrada principal",
    status: "PENDING_REVIEW",
  },
};

// ---------------------------------------------------------------------------
// Setup helpers
// ---------------------------------------------------------------------------

function setupAuthenticatedUser(options?: {
  ok?: boolean;
  actorId?: string;
  status?: number;
}) {
  const { ok = true, actorId = "user-1", status = 401 } = options ?? {};
  if (!ok) {
    mockRequireAuthenticatedUser.mockResolvedValue({
      ok: false,
      response: NextResponse.json({ error: "Unauthorized" }, { status }),
    });
  } else {
    mockRequireAuthenticatedUser.mockResolvedValue({
      ok: true,
      actor: { id: actorId },
      prisma: {},
    });
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

const COMMUNITY_ID = "22222222-2222-2222-2222-222222222222";

describe("POST /api/communities/[communityId]/cameras", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default mocks para las factory functions
    mockCreateRtspCipherFromEnv.mockReturnValue({});
    mockCreatePrismaAuditLogAdapter.mockReturnValue({});
    mockCreatePrismaCameraRepository.mockReturnValue({
      runInTransaction: vi
        .fn()
        .mockImplementation(async (fn: (tx: unknown) => unknown) => fn({})),
    });
  });

  it("responde 201 cuando un miembro ACTIVE registra una camara valida", async () => {
    setupAuthenticatedUser({ ok: true });
    mockRegisterCommunityCamera.mockResolvedValue(successCameraResult);

    const response = await POST(
      createRequest(validBody),
      { params: Promise.resolve({ communityId: COMMUNITY_ID }) },
    );
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.data.camera.name).toBe("Camara entrada principal");
    expect(mockRegisterCommunityCamera).toHaveBeenCalledWith(
      expect.objectContaining({
        actor: { id: "user-1" },
        communityId: COMMUNITY_ID,
        name: "Camara entrada principal",
        rtspUrl: "rtsp://192.168.1.100:554/stream",
      }),
      expect.any(Object),
    );
  });

  it("responde 201 sin campos opcionales", async () => {
    setupAuthenticatedUser({ ok: true });
    mockRegisterCommunityCamera.mockResolvedValue({
      camera: {
        id: "cam-1",
        communityId: COMMUNITY_ID,
        ownerId: "user-1",
        name: "Camara minimal",
        status: "PENDING_REVIEW",
      },
    });

    const minimalBody = {
      name: "Camara minimal",
      rtspUrl: "rtsp://192.168.1.100:554/stream",
    };

    const response = await POST(
      createRequest(minimalBody),
      { params: Promise.resolve({ communityId: COMMUNITY_ID }) },
    );
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(mockRegisterCommunityCamera).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "Camara minimal",
        description: undefined,
        approximateLocation: undefined,
        sectorId: undefined,
        streamKey: undefined,
      }),
      expect.any(Object),
    );
  });

  it("responde 400 cuando falta name", async () => {
    setupAuthenticatedUser({ ok: true });

    const response = await POST(
      createRequest({ rtspUrl: "rtsp://192.168.1.100:554/stream" }),
      { params: Promise.resolve({ communityId: COMMUNITY_ID }) },
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe("name is required");
  });

  it("responde 400 cuando rtspUrl no comienza con rtsp://", async () => {
    setupAuthenticatedUser({ ok: true });

    const response = await POST(
      createRequest({ name: "Test", rtspUrl: "http://192.168.1.100/stream" }),
      { params: Promise.resolve({ communityId: COMMUNITY_ID }) },
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe("rtspUrl must start with rtsp://");
  });

  it("responde 400 cuando sectorId no es UUID valido", async () => {
    setupAuthenticatedUser({ ok: true });

    const response = await POST(
      createRequest({
        name: "Test",
        rtspUrl: "rtsp://192.168.1.100:554/stream",
        sectorId: "not-a-uuid",
      }),
      { params: Promise.resolve({ communityId: COMMUNITY_ID }) },
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe("sectorId must be a valid UUID");
  });

  it("responde 403 cuando el actor no es miembro ACTIVE (policy)", async () => {
    setupAuthenticatedUser({ ok: true });
    mockRegisterCommunityCamera.mockRejectedValue(
      new CommunityAuthorizationError(
        "Only an ACTIVE NEIGHBOR, GUARD, or ADMIN can register a camera",
      ),
    );

    const response = await POST(
      createRequest(validBody),
      { params: Promise.resolve({ communityId: COMMUNITY_ID }) },
    );
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.error).toBe(
      "Only an ACTIVE NEIGHBOR, GUARD, or ADMIN can register a camera",
    );
  });

  it("responde 404 cuando la comunidad no existe", async () => {
    setupAuthenticatedUser({ ok: true });
    mockRegisterCommunityCamera.mockRejectedValue(
      new CommunityNotFoundError("Community not found"),
    );

    const response = await POST(
      createRequest(validBody),
      { params: Promise.resolve({ communityId: COMMUNITY_ID }) },
    );
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error).toBe("Community not found");
  });

  it("responde 500 para errores inesperados del dominio", async () => {
    setupAuthenticatedUser({ ok: true });
    mockRegisterCommunityCamera.mockRejectedValue(new Error("Database connection lost"));

    const response = await POST(
      createRequest(validBody),
      { params: Promise.resolve({ communityId: COMMUNITY_ID }) },
    );
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.error).toBe("Internal server error");
  });
});
