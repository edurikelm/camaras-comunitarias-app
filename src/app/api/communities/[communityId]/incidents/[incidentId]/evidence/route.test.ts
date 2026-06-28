import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import {
  DomainError,
  type DomainErrorContext,
  type DomainErrorResponse,
} from "@/domain/shared/domain-error";

// Mock error classes — defined before vi.hoisted so DomainError is in scope.
// These must be recognised by DomainErrorMapper via instanceof DomainError.
class MockAuthError extends DomainError {
  override name = "CommunityAuthorizationError";
  constructor(m = "Not authorized") {
    super(m);
  }
  httpResponse(_ctx: DomainErrorContext): DomainErrorResponse {
    return { status: 403, body: { error: this.message } };
  }
}

class MockInvariantError extends DomainError {
  override name = "CommunityInvariantError";
  constructor(m: string) {
    super(m);
  }
  httpResponse(_ctx: DomainErrorContext): DomainErrorResponse {
    return { status: 400, body: { error: this.message } };
  }
}

class MockNotFoundError extends MockInvariantError {
  override name = "CommunityNotFoundError";
  constructor(m = "Not found") {
    super(m);
  }
  httpResponse(_ctx: DomainErrorContext): DomainErrorResponse {
    return { status: 404, body: { error: this.message } };
  }
}

// ---------------------------------------------------------------------------
// Hoisted mock factories — these run BEFORE imports due to vi.mock hoisting.
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

const { mockCreateSupabaseEvidenceStorageFromEnv } = vi.hoisted(() => ({
  mockCreateSupabaseEvidenceStorageFromEnv: vi.fn(() => ({
    uploadFile: vi.fn(),
    createSignedUrl: vi.fn(),
    deleteFile: vi.fn(),
  })),
}));

const { mockUploadEvidence, mockGetEvidence } = vi.hoisted(() => ({
  mockUploadEvidence: vi.fn(),
  mockGetEvidence: vi.fn(),
}));

const {
  MockCommunityAuthorizationError,
  MockCommunityInvariantError,
  MockCommunityNotFoundError,
} = {
  MockCommunityAuthorizationError: MockAuthError,
  MockCommunityInvariantError: MockInvariantError,
  MockCommunityNotFoundError: MockNotFoundError,
};

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

vi.mock("@/lib/api/auth-prelude", () => ({
  requireAuthenticatedUser: mockRequireAuthenticatedUser,
}));

vi.mock("@/infrastructure/prisma/evidence-repository", () => ({
  createPrismaEvidenceRepository: vi.fn(() => ({})),
}));

vi.mock("@/infrastructure/storage", () => ({
  createSupabaseEvidenceStorageFromEnv: mockCreateSupabaseEvidenceStorageFromEnv,
}));

vi.mock("@/domain/community/evidence/create-evidence", () => ({
  uploadEvidence: mockUploadEvidence,
}));

vi.mock("@/domain/community/evidence/get-evidence", () => ({
  getEvidence: mockGetEvidence,
}));

vi.mock("@/domain/community/errors", () => ({
  CommunityAuthorizationError: MockAuthError,
  CommunityInvariantError: MockInvariantError,
  CommunityNotFoundError: MockNotFoundError,
}));

// ---------------------------------------------------------------------------
// Subject under test
// ---------------------------------------------------------------------------

import { POST, GET } from "./route";

// ---------------------------------------------------------------------------
// Constants & helpers
// ---------------------------------------------------------------------------

const COMMUNITY_ID = "community-1";
const INCIDENT_ID = "incident-1";
const BASE_URL = `http://localhost/api/communities/${COMMUNITY_ID}/incidents/${INCIDENT_ID}/evidence`;

function makeParams() {
  return Promise.resolve({
    communityId: COMMUNITY_ID,
    incidentId: INCIDENT_ID,
  });
}

function setupAuthSuccess(platformUserId = "user-id") {
  mockRequireAuthenticatedUser.mockResolvedValue({
    ok: true,
    actor: { id: platformUserId },
    prisma: {},
  });
}

function setupAuth401() {
  mockRequireAuthenticatedUser.mockResolvedValue({
    ok: false,
    response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
  });
}

function setupAuth403() {
  mockRequireAuthenticatedUser.mockResolvedValue({
    ok: false,
    response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
  });
}

function createPostFormData(
  content: string | Uint8Array,
  fileName: string,
  mimeType: string,
  metadata?: string,
): FormData {
  const formData = new FormData();
  formData.append(
    "file",
    new File(typeof content === "string" ? [content] : [content], fileName, {
      type: mimeType,
    }),
  );
  if (metadata !== undefined) {
    formData.append("metadata", metadata);
  }
  return formData;
}

// ---------------------------------------------------------------------------
// POST /evidence
// ---------------------------------------------------------------------------

describe("POST /api/communities/:communityId/incidents/:incidentId/evidence", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("responde 201 cuando el upload es exitoso con una imagen válida", async () => {
    // Arrange
    setupAuthSuccess();
    mockUploadEvidence.mockResolvedValue({
      evidence: {
        id: "evidence-1",
        communityId: COMMUNITY_ID,
        incidentId: INCIDENT_ID,
        uploadedById: "user-id",
        storagePath: `${COMMUNITY_ID}/${INCIDENT_ID}/uuid.jpg`,
        mimeType: "image/jpeg",
        metadata: null,
        createdAt: new Date("2025-01-01T00:00:00Z"),
      },
    });

    const request = new NextRequest(BASE_URL, {
      method: "POST",
      body: createPostFormData("fake-image", "photo.jpg", "image/jpeg"),
    });

    // Act
    const response = await POST(request, { params: makeParams() });
    const body = await response.json();

    // Assert
    expect(response.status).toBe(201);
    expect(body.data).toBeDefined();
    expect(body.data.id).toBe("evidence-1");
    expect(body.data.mimeType).toBe("image/jpeg");
  });

  it("responde 400 cuando el MIME type no está permitido (PDF)", async () => {
    // Arrange
    setupAuthSuccess();

    const request = new NextRequest(BASE_URL, {
      method: "POST",
      body: createPostFormData("fake-pdf", "doc.pdf", "application/pdf"),
    });

    // Act
    const response = await POST(request, { params: makeParams() });
    const body = await response.json();

    // Assert
    expect(response.status).toBe(400);
    expect(body.error).toContain("Invalid file type");
    expect(mockUploadEvidence).not.toHaveBeenCalled();
  });

  it("responde 400 cuando el archivo está vacío", async () => {
    // Arrange
    setupAuthSuccess();
    mockUploadEvidence.mockRejectedValue(
      new MockCommunityInvariantError("File is empty"),
    );

    const request = new NextRequest(BASE_URL, {
      method: "POST",
      body: createPostFormData("", "empty.jpg", "image/jpeg"),
    });

    // Act
    const response = await POST(request, { params: makeParams() });
    const body = await response.json();

    // Assert
    expect(response.status).toBe(400);
    expect(body.error).toBe("File is empty");
  });

  it("responde 400 cuando el archivo excede 5 MB", async () => {
    // Arrange
    setupAuthSuccess();

    const oversizedContent = new Uint8Array(5 * 1024 * 1024 + 1).fill(0x00);
    const request = new NextRequest(BASE_URL, {
      method: "POST",
      body: createPostFormData(oversizedContent, "large.jpg", "image/jpeg"),
    });

    // Act
    const response = await POST(request, { params: makeParams() });
    const body = await response.json();

    // Assert
    expect(response.status).toBe(400);
    expect(body.error).toBe("File exceeds maximum size of 5 MB");
    expect(mockUploadEvidence).not.toHaveBeenCalled();
  });

  it("responde 400 cuando metadata no es JSON válido", async () => {
    // Arrange
    setupAuthSuccess();

    const formData = createPostFormData("content", "photo.jpg", "image/jpeg", "not-json");

    const request = new NextRequest(BASE_URL, {
      method: "POST",
      body: formData,
    });

    // Act
    const response = await POST(request, { params: makeParams() });
    const body = await response.json();

    // Assert
    expect(response.status).toBe(400);
    expect(body.error).toBe("metadata must be valid JSON");
    expect(mockUploadEvidence).not.toHaveBeenCalled();
  });

  it("responde 401 cuando no hay autenticacion", async () => {
    // Arrange
    setupAuth401();

    const request = new NextRequest(BASE_URL, {
      method: "POST",
      body: createPostFormData("content", "photo.jpg", "image/jpeg"),
    });

    // Act
    const response = await POST(request, { params: makeParams() });
    const body = await response.json();

    // Assert
    expect(response.status).toBe(401);
    expect(body.error).toBe("Unauthorized");
  });

  it("responde 403 cuando el usuario no existe en Prisma", async () => {
    // Arrange
    setupAuth403();

    const request = new NextRequest(BASE_URL, {
      method: "POST",
      body: createPostFormData("content", "photo.jpg", "image/jpeg"),
    });

    // Act
    const response = await POST(request, { params: makeParams() });
    const body = await response.json();

    // Assert
    expect(response.status).toBe(403);
    expect(body.error).toBe("Forbidden");
  });

  it("responde 403 cuando el actor no es miembro ACTIVE de la comunidad", async () => {
    // Arrange
    setupAuthSuccess();
    mockUploadEvidence.mockRejectedValue(
      new MockCommunityAuthorizationError(
        "Only an ACTIVE community member can upload evidence",
      ),
    );

    const request = new NextRequest(BASE_URL, {
      method: "POST",
      body: createPostFormData("content", "photo.jpg", "image/jpeg"),
    });

    // Act
    const response = await POST(request, { params: makeParams() });
    const body = await response.json();

    // Assert
    expect(response.status).toBe(403);
    expect(body.error).toBe(
      "Only an ACTIVE community member can upload evidence",
    );
  });

  it("responde 404 cuando la comunidad no existe", async () => {
    // Arrange
    setupAuthSuccess();
    mockUploadEvidence.mockRejectedValue(
      new MockCommunityNotFoundError("Community not found"),
    );

    const request = new NextRequest(BASE_URL, {
      method: "POST",
      body: createPostFormData("content", "photo.jpg", "image/jpeg"),
    });

    // Act
    const response = await POST(request, { params: makeParams() });
    const body = await response.json();

    // Assert
    expect(response.status).toBe(404);
    expect(body.error).toBe("Community not found");
  });

  it("responde 404 cuando el incidente no existe", async () => {
    // Arrange
    setupAuthSuccess();
    mockUploadEvidence.mockRejectedValue(
      new MockCommunityNotFoundError("Incident not found"),
    );

    const request = new NextRequest(BASE_URL, {
      method: "POST",
      body: createPostFormData("content", "photo.jpg", "image/jpeg"),
    });

    // Act
    const response = await POST(request, { params: makeParams() });
    const body = await response.json();

    // Assert
    expect(response.status).toBe(404);
    expect(body.error).toBe("Incident not found");
  });

  it("responde 400 cuando el incidente está CLOSED", async () => {
    // Arrange
    setupAuthSuccess();
    mockUploadEvidence.mockRejectedValue(
      new MockCommunityInvariantError(
        "Evidence can only be uploaded to OPEN or REVIEWING incidents",
      ),
    );

    const request = new NextRequest(BASE_URL, {
      method: "POST",
      body: createPostFormData("content", "photo.jpg", "image/jpeg"),
    });

    // Act
    const response = await POST(request, { params: makeParams() });
    const body = await response.json();

    // Assert
    expect(response.status).toBe(400);
    expect(body.error).toBe(
      "Evidence can only be uploaded to OPEN or REVIEWING incidents",
    );
  });
});

// ---------------------------------------------------------------------------
// GET /evidence
// ---------------------------------------------------------------------------

describe("GET /api/communities/:communityId/incidents/:incidentId/evidence", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("responde 200 con la lista de evidencia y signed URLs", async () => {
    // Arrange
    setupAuthSuccess();
    mockGetEvidence.mockResolvedValue({
      items: [
        {
          id: "evidence-1",
          mimeType: "image/jpeg",
          signedUrl: "https://example.com/signed-url-1",
          metadata: null,
          createdAt: new Date("2025-01-01T00:00:00Z"),
        },
      ],
    });

    const request = new NextRequest(BASE_URL, { method: "GET" });

    // Act
    const response = await GET(request, { params: makeParams() });
    const body = await response.json();

    // Assert
    expect(response.status).toBe(200);
    expect(body.data).toBeDefined();
    expect(body.data.items).toHaveLength(1);
    expect(body.data.items[0].signedUrl).toBe(
      "https://example.com/signed-url-1",
    );
  });

  it("responde 401 cuando no hay autenticacion", async () => {
    // Arrange
    setupAuth401();

    const request = new NextRequest(BASE_URL, { method: "GET" });

    // Act
    const response = await GET(request, { params: makeParams() });
    const body = await response.json();

    // Assert
    expect(response.status).toBe(401);
    expect(body.error).toBe("Unauthorized");
  });

  it("responde 403 cuando el usuario no existe en Prisma", async () => {
    // Arrange
    setupAuth403();

    const request = new NextRequest(BASE_URL, { method: "GET" });

    // Act
    const response = await GET(request, { params: makeParams() });
    const body = await response.json();

    // Assert
    expect(response.status).toBe(403);
    expect(body.error).toBe("Forbidden");
  });

  it("responde 403 cuando NEIGHBOR no es creador del incidente", async () => {
    // Arrange
    setupAuthSuccess();
    mockGetEvidence.mockRejectedValue(
      new MockCommunityAuthorizationError(
        "Only the incident creator, an ADMIN, or a GUARD can view evidence",
      ),
    );

    const request = new NextRequest(BASE_URL, { method: "GET" });

    // Act
    const response = await GET(request, { params: makeParams() });
    const body = await response.json();

    // Assert
    expect(response.status).toBe(403);
    expect(body.error).toBe(
      "Only the incident creator, an ADMIN, or a GUARD can view evidence",
    );
  });

  it("responde 404 cuando la comunidad no existe", async () => {
    // Arrange
    setupAuthSuccess();
    mockGetEvidence.mockRejectedValue(
      new MockCommunityNotFoundError("Community not found"),
    );

    const request = new NextRequest(BASE_URL, { method: "GET" });

    // Act
    const response = await GET(request, { params: makeParams() });
    const body = await response.json();

    // Assert
    expect(response.status).toBe(404);
    expect(body.error).toBe("Community not found");
  });

  it("responde 404 cuando el incidente no existe", async () => {
    // Arrange
    setupAuthSuccess();
    mockGetEvidence.mockRejectedValue(
      new MockCommunityNotFoundError("Incident not found"),
    );

    const request = new NextRequest(BASE_URL, { method: "GET" });

    // Act
    const response = await GET(request, { params: makeParams() });
    const body = await response.json();

    // Assert
    expect(response.status).toBe(404);
    expect(body.error).toBe("Incident not found");
  });
});
