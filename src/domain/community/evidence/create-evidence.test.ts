import { describe, expect, it, vi } from "vitest";
import {
  AuditAction,
  IncidentStatus,
  CommunityMemberRole,
  CommunityMemberStatus,
  CommunityStatus,
} from "@/generated/prisma/enums";
import {
  CommunityAuthorizationError,
  CommunityInvariantError,
} from "@/domain/community/errors";
import { uploadEvidence } from "./create-evidence";
import type { EvidenceRepository } from "./evidence-repository";
import type { EvidenceStoragePort } from "./evidence-storage";
import { EvidenceStorageError } from "./evidence-storage";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createRepository(
  overrides: Partial<EvidenceRepository> = {},
): EvidenceRepository {
  const repository: EvidenceRepository = {
    // Community queries
    findCommunityById: vi.fn(async () => ({
      id: "community-1",
      name: "Barrio Norte",
      status: CommunityStatus.ACTIVE,
    })),
    findActiveMember: vi.fn(async () => ({
      id: "member-1",
      userId: "user-1",
      communityId: "community-1",
      role: CommunityMemberRole.NEIGHBOR,
      status: CommunityMemberStatus.ACTIVE,
    })),
    findActiveAdminOrGuardMember: vi.fn(),
    findActiveAdminMember: vi.fn(),
    findActiveNeighborOrGuardMember: vi.fn(),
    findSectorById: vi.fn(),

    // Incident queries
    findIncidentById: vi.fn(async (communityId, incidentId) => ({
      id: incidentId,
      communityId,
      createdById: "user-1",
      status: IncidentStatus.OPEN,
    })),

    // Evidence
    findEvidenceByIncident: vi.fn(),
    createEvidence: vi.fn(async (input) => ({
      id: "evidence-1",
      communityId: input.communityId,
      incidentId: input.incidentId,
      uploadedById: input.uploadedById,
      storagePath: input.storagePath,
      mimeType: input.mimeType,
      metadata: null,
      createdAt: new Date("2026-06-27T12:00:00Z"),
      deletedAt: null,
    })),

    // Audit
    createAuditLog: vi.fn(),

    // Transaction
    runInTransaction: vi.fn(async (op) => op(repository)),

    ...overrides,
  };
  return repository;
}

function createStorage(overrides: Partial<EvidenceStoragePort> = {}): EvidenceStoragePort {
  return {
    uploadFile: vi.fn(),
    createSignedUrl: vi.fn(),
    deleteFile: vi.fn(),
    ...overrides,
  };
}

const pngBuffer = Buffer.from(
  new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
);

const validInput = {
  actor: { id: "user-1" },
  communityId: "community-1",
  incidentId: "incident-1",
  file: pngBuffer as Buffer,
  mimeType: "image/png",
  metadata: undefined as Record<string, unknown> | undefined,
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("uploadEvidence", () => {
  it("NEIGHBOR sube imagen PNG exitosamente", async () => {
    const repository = createRepository();
    const storage = createStorage();

    const result = await uploadEvidence(validInput, {
      evidenceRepository: repository,
      evidenceStorage: storage,
    });

    expect(result.evidence).toMatchObject({
      id: "evidence-1",
      communityId: "community-1",
      incidentId: "incident-1",
      uploadedById: "user-1",
      mimeType: "image/png",
    });

    expect(storage.uploadFile).toHaveBeenCalledWith(
      expect.objectContaining({
        mimeType: "image/png",
        storagePath: expect.stringMatching(
          /^community-1\/incident-1\/[0-9a-f-]+\.png$/,
        ),
      }),
    );

    expect(repository.createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: AuditAction.EVIDENCE_UPLOADED,
        entityType: "Evidence",
        entityId: "evidence-1",
        metadata: expect.objectContaining({
          incidentId: "incident-1",
          mimeType: "image/png",
        }),
      }),
    );
  });

  it("GUARD sube imagen exitosamente", async () => {
    const repository = createRepository({
      findActiveMember: vi.fn(async () => ({
        id: "member-guard",
        userId: "user-guard",
        communityId: "community-1",
        role: CommunityMemberRole.GUARD,
        status: CommunityMemberStatus.ACTIVE,
      })),
    });
    const storage = createStorage();

    const result = await uploadEvidence(
      { ...validInput, actor: { id: "user-guard" } },
      { evidenceRepository: repository, evidenceStorage: storage },
    );

    expect(result.evidence).toMatchObject({
      communityId: "community-1",
      mimeType: "image/png",
    });
  });

  it("ADMIN sube imagen exitosamente", async () => {
    const repository = createRepository({
      findActiveMember: vi.fn(async () => ({
        id: "member-admin",
        userId: "user-admin",
        communityId: "community-1",
        role: CommunityMemberRole.ADMIN,
        status: CommunityMemberStatus.ACTIVE,
      })),
    });
    const storage = createStorage();

    const result = await uploadEvidence(
      { ...validInput, actor: { id: "user-admin" } },
      { evidenceRepository: repository, evidenceStorage: storage },
    );

    expect(result.evidence).toMatchObject({
      communityId: "community-1",
      mimeType: "image/png",
    });
  });

  it("rechaza actor que no es miembro activo", async () => {
    const repository = createRepository({
      findActiveMember: vi.fn(async () => null),
    });
    const storage = createStorage();

    await expect(
      uploadEvidence(validInput, {
        evidenceRepository: repository,
        evidenceStorage: storage,
      }),
    ).rejects.toThrow(CommunityAuthorizationError);

    // Storage-first: uploadFile called, then transaction failed, then compensation deleteFile called
    expect(storage.uploadFile).toHaveBeenCalledTimes(1);
    expect(storage.deleteFile).toHaveBeenCalledTimes(1);
    expect(repository.createEvidence).not.toHaveBeenCalled();
    expect(repository.createAuditLog).not.toHaveBeenCalled();
  });

  it("rechaza miembro PENDING", async () => {
    const repository = createRepository({
      findActiveMember: vi.fn(async () => null),
    });
    const storage = createStorage();

    await expect(
      uploadEvidence(
        { ...validInput, actor: { id: "pending-user" } },
        { evidenceRepository: repository, evidenceStorage: storage },
      ),
    ).rejects.toThrow(
      "Only an ACTIVE community member can upload evidence",
    );
  });

  it("rechaza comunidad inexistente", async () => {
    const repository = createRepository({
      findCommunityById: vi.fn(async () => null),
    });
    const storage = createStorage();

    await expect(
      uploadEvidence(validInput, {
        evidenceRepository: repository,
        evidenceStorage: storage,
      }),
    ).rejects.toThrow("Community not found");

    // Storage-first: uploadFile called before transaction validation
    expect(storage.uploadFile).toHaveBeenCalledTimes(1);
    expect(storage.deleteFile).toHaveBeenCalledTimes(1); // compensation
    expect(repository.createEvidence).not.toHaveBeenCalled();
  });

  it("rechaza comunidad no ACTIVE", async () => {
    const repository = createRepository({
      findCommunityById: vi.fn(async () => ({
        id: "community-suspended",
        name: "Suspended",
        status: CommunityStatus.SUSPENDED,
      })),
    });
    const storage = createStorage();

    await expect(
      uploadEvidence(validInput, {
        evidenceRepository: repository,
        evidenceStorage: storage,
      }),
    ).rejects.toThrow("Community is not active");

    // Storage-first: uploadFile called, compensation deleteFile called
    expect(storage.uploadFile).toHaveBeenCalledTimes(1);
    expect(storage.deleteFile).toHaveBeenCalledTimes(1);
  });

  it("rechaza incidente inexistente", async () => {
    const repository = createRepository({
      findIncidentById: vi.fn(async () => null),
    });
    const storage = createStorage();

    await expect(
      uploadEvidence(validInput, {
        evidenceRepository: repository,
        evidenceStorage: storage,
      }),
    ).rejects.toThrow("Incident not found");

    // Storage-first: uploadFile called, compensation deleteFile called
    expect(storage.uploadFile).toHaveBeenCalledTimes(1);
    expect(storage.deleteFile).toHaveBeenCalledTimes(1);
    expect(repository.createEvidence).not.toHaveBeenCalled();
  });

  it("rechaza incidente CLOSED", async () => {
    const repository = createRepository({
      findIncidentById: vi.fn(async (communityId, incidentId) => ({
        id: incidentId,
        communityId,
        createdById: "user-1",
        status: IncidentStatus.CLOSED,
      })),
    });
    const storage = createStorage();

    await expect(
      uploadEvidence(validInput, {
        evidenceRepository: repository,
        evidenceStorage: storage,
      }),
    ).rejects.toThrow(
      "Evidence can only be uploaded to OPEN or REVIEWING incidents",
    );

    // Storage-first: uploadFile called, compensation deleteFile called
    expect(storage.uploadFile).toHaveBeenCalledTimes(1);
    expect(storage.deleteFile).toHaveBeenCalledTimes(1);
    expect(repository.createEvidence).not.toHaveBeenCalled();
  });

  it("permite subir a incidente REVIEWING", async () => {
    const repository = createRepository({
      findIncidentById: vi.fn(async (communityId, incidentId) => ({
        id: incidentId,
        communityId,
        createdById: "user-1",
        status: IncidentStatus.REVIEWING,
      })),
    });
    const storage = createStorage();

    const result = await uploadEvidence(validInput, {
      evidenceRepository: repository,
      evidenceStorage: storage,
    });

    expect(result.evidence.mimeType).toBe("image/png");
    expect(repository.createAuditLog).toHaveBeenCalled();
  });

  it("rechaza MIME type invalido", async () => {
    const repository = createRepository();
    const storage = createStorage();

    await expect(
      uploadEvidence(
        { ...validInput, mimeType: "application/pdf" },
        { evidenceRepository: repository, evidenceStorage: storage },
      ),
    ).rejects.toThrow("Invalid MIME type");

    expect(repository.runInTransaction).not.toHaveBeenCalled();
    expect(storage.uploadFile).not.toHaveBeenCalled();
  });

  it("rechaza imagen GIF", async () => {
    const repository = createRepository();
    const storage = createStorage();

    await expect(
      uploadEvidence(
        { ...validInput, mimeType: "image/gif" },
        { evidenceRepository: repository, evidenceStorage: storage },
      ),
    ).rejects.toThrow("Invalid MIME type");
  });

  it("acepta image/jpeg", async () => {
    const repository = createRepository();
    const storage = createStorage();

    const result = await uploadEvidence(
      { ...validInput, mimeType: "image/jpeg" },
      { evidenceRepository: repository, evidenceStorage: storage },
    );

    expect(result.evidence.mimeType).toBe("image/jpeg");
  });

  it("acepta image/webp", async () => {
    const repository = createRepository();
    const storage = createStorage();

    const result = await uploadEvidence(
      { ...validInput, mimeType: "image/webp" },
      { evidenceRepository: repository, evidenceStorage: storage },
    );

    expect(result.evidence.mimeType).toBe("image/webp");
  });

  it("rechaza archivo vacio", async () => {
    const repository = createRepository();
    const storage = createStorage();

    await expect(
      uploadEvidence(
        { ...validInput, file: Buffer.from([]) },
        { evidenceRepository: repository, evidenceStorage: storage },
      ),
    ).rejects.toThrow("File is empty");
  });

  it("rechaza archivo que excede 5MB", async () => {
    const repository = createRepository();
    const storage = createStorage();
    const bigBuffer = Buffer.alloc(6 * 1024 * 1024);

    await expect(
      uploadEvidence(
        { ...validInput, file: bigBuffer },
        { evidenceRepository: repository, evidenceStorage: storage },
      ),
    ).rejects.toThrow("File exceeds maximum size of 5 MB");
  });

  it("rechaza communityId vacio", async () => {
    const repository = createRepository();
    const storage = createStorage();

    await expect(
      uploadEvidence(
        { ...validInput, communityId: "" },
        { evidenceRepository: repository, evidenceStorage: storage },
      ),
    ).rejects.toThrow(CommunityInvariantError);

    expect(repository.runInTransaction).not.toHaveBeenCalled();
    expect(storage.uploadFile).not.toHaveBeenCalled();
  });

  it("rechaza incidentId vacio", async () => {
    const repository = createRepository();
    const storage = createStorage();

    await expect(
      uploadEvidence(
        { ...validInput, incidentId: "" },
        { evidenceRepository: repository, evidenceStorage: storage },
      ),
    ).rejects.toThrow(CommunityInvariantError);

    expect(repository.runInTransaction).not.toHaveBeenCalled();
    expect(storage.uploadFile).not.toHaveBeenCalled();
  });

  it("incluye metadata opcional en el registro", async () => {
    const repository = createRepository();
    const storage = createStorage();
    const metadata = { source: "user-upload", notes: "Photo of suspect" };

    const result = await uploadEvidence(
      { ...validInput, metadata },
      { evidenceRepository: repository, evidenceStorage: storage },
    );

    // Metadata is stored via createEvidence (the mock returns null though)
    // Verify it was passed to the repository
    expect(repository.createEvidence).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata,
      }),
    );
  });

  it("genera storagePath con extension correcta para jpeg", async () => {
    const repository = createRepository();
    const storage = createStorage();

    await uploadEvidence(
      { ...validInput, mimeType: "image/jpeg" },
      { evidenceRepository: repository, evidenceStorage: storage },
    );

    expect(storage.uploadFile).toHaveBeenCalledWith(
      expect.objectContaining({
        storagePath: expect.stringMatching(/\.jpg$/),
      }),
    );
  });

  it("compensa con deleteFile si la transaccion Prisma falla", async () => {
    const repository = createRepository({
      findCommunityById: vi.fn(async () => {
        throw new Error("DB connection lost");
      }),
    });
    const storage = createStorage();

    await expect(
      uploadEvidence(validInput, {
        evidenceRepository: repository,
        evidenceStorage: storage,
      }),
    ).rejects.toThrow("DB connection lost");

    // Upload was called first (storage-first)
    expect(storage.uploadFile).toHaveBeenCalledTimes(1);
    // Compensation called after DB failure
    expect(storage.deleteFile).toHaveBeenCalledTimes(1);
    // createEvidence was never called
    expect(repository.createEvidence).not.toHaveBeenCalled();
  });

  it("si uploadFile falla, NO se llama a createEvidence ni deleteFile", async () => {
    const repository = createRepository();
    const storage = createStorage({
      uploadFile: vi.fn().mockRejectedValue(
        new EvidenceStorageError("Upload failed", new Error("Network error")),
      ),
    });

    await expect(
      uploadEvidence(validInput, {
        evidenceRepository: repository,
        evidenceStorage: storage,
      }),
    ).rejects.toThrow(EvidenceStorageError);

    // uploadFile failed so we don't proceed to transaction
    expect(storage.uploadFile).toHaveBeenCalledTimes(1);
    // No compensation needed since upload failed
    expect(storage.deleteFile).not.toHaveBeenCalled();
    expect(repository.createEvidence).not.toHaveBeenCalled();
  });
});
