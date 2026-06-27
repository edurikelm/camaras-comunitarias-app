import { describe, expect, it, vi } from "vitest";
import {
  AuditAction,
  CommunityMemberRole,
  CommunityMemberStatus,
  CommunityStatus,
} from "@/generated/prisma/enums";
import { requestCommunityMembership } from "./request-community-membership";
import type { CommunityMembershipRepository } from "@/domain/community/community-repository";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const FIXED_CODE_HASH =
  "abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890";

function createRepository(
  overrides: Partial<CommunityMembershipRepository> = {},
): CommunityMembershipRepository {
  const repository: CommunityMembershipRepository = {
    findCommunityById: vi.fn(async () => ({
      id: "community-1",
      name: "Barrio Norte",
      status: CommunityStatus.ACTIVE,
    })),
    findActiveAdminMember: vi.fn(),
    findCommunityMemberByUserId: vi.fn(async () => null),
    findCommunityMemberById: vi.fn(),
    findInvitationByCodeHash: vi.fn(async (codeHash) => {
      if (codeHash === FIXED_CODE_HASH) {
        return {
          id: "invitation-1",
          communityId: "community-1",
          codeHash: FIXED_CODE_HASH,
          expiresAt: null,
          usedAt: null,
          revokedAt: null,
          createdAt: new Date("2026-01-01T00:00:00Z"),
        };
      }
      return null;
    }),
    createCommunityInvitation: vi.fn(),
    markInvitationUsedIfAvailable: vi.fn(async () => true),
    createCommunityMember: vi.fn(async (input) => ({
      id: "member-1",
      ...input,
    })),
    updateCommunityMember: vi.fn(),
    createAuditLog: vi.fn(),
    runInTransaction: vi.fn(async (op) => op(repository)),
    ...overrides,
  };
  return repository;
}

const validInput = {
  userId: "user-new-1",
  code: "the-plain-code",
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("requestCommunityMembership", () => {
  it("permite canjear codigo valido y crear miembro PENDING", async () => {
    const repository = createRepository();
    const hashCode = vi.fn(() => FIXED_CODE_HASH);

    const result = await requestCommunityMembership(validInput, {
      repository,
      hashCode,
    });

    expect(result.member).toMatchObject({
      id: "member-1",
      communityId: "community-1",
      userId: "user-new-1",
      status: CommunityMemberStatus.PENDING,
    });

    // default role is NEIGHBOR (will be set on approval)
    expect(result.member.role).toBe(CommunityMemberRole.NEIGHBOR);

    // Invitation marked as used via atomic claim
    expect(repository.markInvitationUsedIfAvailable).toHaveBeenCalledWith(
      "invitation-1",
    );

    // Audited
    expect(repository.createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: AuditAction.MEMBER_REQUESTED,
        entityType: "CommunityMember",
        entityId: "member-1",
        communityId: "community-1",
        actorId: "user-new-1",
      }),
    );
  });

  it("rechaza codigo vacio", async () => {
    const repository = createRepository();

    await expect(
      requestCommunityMembership(
        { ...validInput, code: "   " },
        { repository },
      ),
    ).rejects.toThrow("Invitation code is required");

    expect(repository.runInTransaction).not.toHaveBeenCalled();
  });

  it("rechaza userId vacio", async () => {
    const repository = createRepository();

    await expect(
      requestCommunityMembership(
        { ...validInput, userId: "   " },
        { repository },
      ),
    ).rejects.toThrow("userId is required");

    expect(repository.runInTransaction).not.toHaveBeenCalled();
  });

  it("rechaza codigo de invitacion invalido", async () => {
    const repository = createRepository();

    await expect(
      requestCommunityMembership(
        { ...validInput, code: "wrong-code" },
        { repository, hashCode: () => "nonexistent-hash" },
      ),
    ).rejects.toThrow("Invalid invitation code");

    expect(repository.markInvitationUsedIfAvailable).not.toHaveBeenCalled();
    expect(repository.createCommunityMember).not.toHaveBeenCalled();
  });

  it("rechaza invitacion revocada", async () => {
    const repository = createRepository({
      findInvitationByCodeHash: vi.fn(async () => ({
        id: "invitation-revoked",
        communityId: "community-1",
        codeHash: FIXED_CODE_HASH,
        expiresAt: null,
        usedAt: null,
        revokedAt: new Date("2026-01-02T00:00:00Z"),
        createdAt: new Date("2026-01-01T00:00:00Z"),
      })),
    });

    await expect(
      requestCommunityMembership(validInput, {
        repository,
        hashCode: () => FIXED_CODE_HASH,
      }),
    ).rejects.toThrow("Invitation has been revoked");

    expect(repository.createCommunityMember).not.toHaveBeenCalled();
  });

  it("rechaza invitacion ya usada (atomic claim falla)", async () => {
    const repository = createRepository({
      markInvitationUsedIfAvailable: vi.fn(async () => false),
    });

    await expect(
      requestCommunityMembership(validInput, {
        repository,
        hashCode: () => FIXED_CODE_HASH,
      }),
    ).rejects.toThrow("Invitation has already been used");

    expect(repository.createCommunityMember).not.toHaveBeenCalled();
    expect(repository.createAuditLog).not.toHaveBeenCalled();
  });

  it("rechaza invitacion expirada", async () => {
    const repository = createRepository({
      findInvitationByCodeHash: vi.fn(async () => ({
        id: "invitation-expired",
        communityId: "community-1",
        codeHash: FIXED_CODE_HASH,
        expiresAt: new Date("2025-01-01T00:00:00Z"), // past date
        usedAt: null,
        revokedAt: null,
        createdAt: new Date("2024-01-01T00:00:00Z"),
      })),
    });

    await expect(
      requestCommunityMembership(validInput, {
        repository,
        hashCode: () => FIXED_CODE_HASH,
      }),
    ).rejects.toThrow("Invitation has expired");

    expect(repository.createCommunityMember).not.toHaveBeenCalled();
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
      requestCommunityMembership(validInput, {
        repository,
        hashCode: () => FIXED_CODE_HASH,
      }),
    ).rejects.toThrow("Community is not accepting new members");

    expect(repository.markInvitationUsedIfAvailable).not.toHaveBeenCalled();
    expect(repository.createCommunityMember).not.toHaveBeenCalled();
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
      requestCommunityMembership(validInput, {
        repository,
        hashCode: () => FIXED_CODE_HASH,
      }),
    ).rejects.toThrow("Community is not accepting new members");

    expect(repository.markInvitationUsedIfAvailable).not.toHaveBeenCalled();
    expect(repository.createCommunityMember).not.toHaveBeenCalled();
  });

  it("rechaza si el usuario ya pertenece a una comunidad", async () => {
    const repository = createRepository({
      findCommunityMemberByUserId: vi.fn(async () => ({
        id: "existing-member",
        userId: "user-new-1",
        communityId: "other-community",
        role: CommunityMemberRole.NEIGHBOR,
        status: CommunityMemberStatus.ACTIVE,
      })),
    });

    await expect(
      requestCommunityMembership(validInput, {
        repository,
        hashCode: () => FIXED_CODE_HASH,
      }),
    ).rejects.toThrow("User already belongs to a community in the MVP");

    expect(repository.createCommunityMember).not.toHaveBeenCalled();
  });
});
