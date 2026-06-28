import { describe, expect, it, vi } from "vitest";
import {
  AuditAction,
  CommunityMemberRole,
  CommunityMemberStatus,
  CommunityStatus,
} from "@/generated/prisma/enums";
import { createCommunityInvitation } from "./create-community-invitation";
import type { CommunityMembershipRepository } from "@/domain/community/community-repository";
import { CommunityNotFoundError } from "@/domain/community/errors";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createRepository(
  overrides: Partial<CommunityMembershipRepository> = {},
): CommunityMembershipRepository {
  const repository: CommunityMembershipRepository = {
    findCommunityById: vi.fn(async () => ({
      id: "community-1",
      name: "Barrio Norte",
      status: CommunityStatus.ACTIVE,
    })),
    findActiveAdminMember: vi.fn(async () => ({
      id: "member-admin-1",
      userId: "user-admin-1",
      communityId: "community-1",
      role: CommunityMemberRole.ADMIN,
      status: CommunityMemberStatus.ACTIVE,
    })),
    findCommunityMemberByUserId: vi.fn(),
    findCommunityMemberById: vi.fn(),
    findInvitationByCodeHash: vi.fn(),
    createCommunityInvitation: vi.fn(async (input) => ({
      id: "invitation-1",
      communityId: input.communityId,
      codeHash: input.codeHash,
      expiresAt: null,
      usedAt: null,
      revokedAt: null,
      createdAt: new Date("2026-01-01T00:00:00Z"),
    })),
    markInvitationUsedIfAvailable: vi.fn(),
    createCommunityMember: vi.fn(),
    updateCommunityMember: vi.fn(),
    createAuditLog: vi.fn(),
    runInTransaction: vi.fn(async (op) => op(repository)),
    ...overrides,
  };
  return repository;
}

const validInput = {
  actor: { id: "user-admin-1" },
  communityId: "community-1",
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("createCommunityInvitation", () => {
  it("crea una invitacion generica y devuelve el codigo plano", async () => {
    const repository = createRepository();

    const result = await createCommunityInvitation(validInput, {
      repository,
    });

    // Returns plain code
    expect(result.plainCode).toBeTruthy();
    expect(typeof result.plainCode).toBe("string");
    expect(result.plainCode).not.toContain("="); // URL-safe base64url

    // Stores hash (not plain code)
    const createdInvitation = vi.mocked(repository.createCommunityInvitation).mock
      .calls[0][0] as unknown as { codeHash: string };
    expect(createdInvitation.codeHash).not.toBe(result.plainCode);
    expect(createdInvitation.codeHash).toMatch(/^[a-f0-9]{64}$/); // sha256 hex

    expect(result.invitation).toMatchObject({
      id: "invitation-1",
      communityId: "community-1",
    });

    // Audited
    expect(repository.createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: AuditAction.INVITATION_CREATED,
        entityType: "CommunityInvitation",
        entityId: "invitation-1",
        communityId: "community-1",
        actorId: "user-admin-1",
      }),
    );
  });

  it("rechaza si el actor no es ADMIN ACTIVE de la comunidad", async () => {
    const repository = createRepository({
      findActiveAdminMember: vi.fn(async () => null),
    });

    await expect(
      createCommunityInvitation(validInput, { repository }),
    ).rejects.toThrow("Only an ACTIVE ADMIN can create invitations");

    expect(repository.createCommunityInvitation).not.toHaveBeenCalled();
    expect(repository.createAuditLog).not.toHaveBeenCalled();
  });

  it("rechaza communityId vacio", async () => {
    const repository = createRepository();

    await expect(
      createCommunityInvitation(
        { ...validInput, communityId: "   " },
        { repository },
      ),
    ).rejects.toThrow("communityId is required");

    expect(repository.findActiveAdminMember).not.toHaveBeenCalled();
    expect(repository.runInTransaction).not.toHaveBeenCalled();
  });

  it("rechaza si la comunidad no existe", async () => {
    const repository = createRepository({
      findCommunityById: vi.fn(async () => null),
    });

    await expect(
      createCommunityInvitation(validInput, { repository }),
    ).rejects.toThrow(CommunityNotFoundError);

    expect(repository.createCommunityInvitation).not.toHaveBeenCalled();
    expect(repository.createAuditLog).not.toHaveBeenCalled();
  });

  it("rechaza si la comunidad esta SUSPENDED", async () => {
    const repository = createRepository({
      findCommunityById: vi.fn(async () => ({
        id: "community-1",
        name: "Barrio Norte",
        status: CommunityStatus.SUSPENDED,
      })),
    });

    await expect(
      createCommunityInvitation(validInput, { repository }),
    ).rejects.toThrow("Community is not active");

    expect(repository.createCommunityInvitation).not.toHaveBeenCalled();
    expect(repository.createAuditLog).not.toHaveBeenCalled();
  });

  it("rechaza si la comunidad esta ARCHIVED", async () => {
    const repository = createRepository({
      findCommunityById: vi.fn(async () => ({
        id: "community-1",
        name: "Barrio Norte",
        status: CommunityStatus.ARCHIVED,
      })),
    });

    await expect(
      createCommunityInvitation(validInput, { repository }),
    ).rejects.toThrow("Community is not active");

    expect(repository.createCommunityInvitation).not.toHaveBeenCalled();
    expect(repository.createAuditLog).not.toHaveBeenCalled();
  });
});
