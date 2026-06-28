import { describe, expect, it, vi } from "vitest";
import {
  AuditAction,
  CommunityMemberRole,
  CommunityMemberStatus,
  CommunityStatus,
} from "@/generated/prisma/enums";
import { rejectCommunityMember } from "./reject-community-member";
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
    findCommunityMemberById: vi.fn(async (id) => {
      if (id === "member-pending-1") {
        return {
          id: "member-pending-1",
          userId: "user-new-1",
          communityId: "community-1",
          role: CommunityMemberRole.NEIGHBOR,
          status: CommunityMemberStatus.PENDING,
        };
      }
      return null;
    }),
    findInvitationByCodeHash: vi.fn(),
    createCommunityInvitation: vi.fn(),
    markInvitationUsedIfAvailable: vi.fn(),
    createCommunityMember: vi.fn(),
    updateCommunityMember: vi.fn(async (id, input) => ({
      id,
      userId: "user-new-1",
      communityId: "community-1",
      role: CommunityMemberRole.NEIGHBOR,
      status: (input.status ?? CommunityMemberStatus.BLOCKED) as CommunityMemberStatus,
    })),
    createAuditLog: vi.fn(),
    runInTransaction: vi.fn(async (op) => op(repository)),
    ...overrides,
  };
  return repository;
}

const validInput = {
  actor: { id: "user-admin-1" },
  communityId: "community-1",
  memberId: "member-pending-1",
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("rejectCommunityMember", () => {
  it("rechaza miembro PENDING y audita", async () => {
    const repository = createRepository();

    const result = await rejectCommunityMember(validInput, { repository });

    expect(result.member).toMatchObject({
      id: "member-pending-1",
      communityId: "community-1",
      status: CommunityMemberStatus.BLOCKED,
    });

    expect(repository.updateCommunityMember).toHaveBeenCalledWith(
      "member-pending-1",
      {
        status: CommunityMemberStatus.BLOCKED,
      },
    );

    expect(repository.createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: AuditAction.MEMBER_BLOCKED,
        entityType: "CommunityMember",
        entityId: "member-pending-1",
        communityId: "community-1",
        actorId: "user-admin-1",
      }),
    );
  });

  it("incluye reason en metadata de auditoria", async () => {
    const repository = createRepository();

    await rejectCommunityMember(
      { ...validInput, reason: "Documentacion incompleta" },
      { repository },
    );

    expect(repository.createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: AuditAction.MEMBER_BLOCKED,
        metadata: expect.objectContaining({
          reason: "Documentacion incompleta",
        }),
      }),
    );
  });

  it("rechaza si el actor no es ADMIN ACTIVE", async () => {
    const repository = createRepository({
      findActiveAdminMember: vi.fn(async () => null),
    });

    await expect(
      rejectCommunityMember(validInput, { repository }),
    ).rejects.toThrow("Only an ACTIVE ADMIN can reject members");

    expect(repository.updateCommunityMember).not.toHaveBeenCalled();
    expect(repository.createAuditLog).not.toHaveBeenCalled();
  });

  it("rechaza si el miembro objetivo no existe", async () => {
    const repository = createRepository({
      findCommunityMemberById: vi.fn(async () => null),
    });

    await expect(
      rejectCommunityMember(validInput, { repository }),
    ).rejects.toThrow(CommunityNotFoundError);

    expect(repository.updateCommunityMember).not.toHaveBeenCalled();
  });

  it("rechaza si el miembro objetivo no pertenece a la misma comunidad", async () => {
    const repository = createRepository({
      findCommunityMemberById: vi.fn(async () => ({
        id: "member-pending-1",
        userId: "user-new-1",
        communityId: "other-community",
        role: CommunityMemberRole.NEIGHBOR,
        status: CommunityMemberStatus.PENDING,
      })),
    });

    await expect(
      rejectCommunityMember(validInput, { repository }),
    ).rejects.toThrow("Member does not belong to this community");
  });

  it("rechaza si el miembro objetivo no esta PENDING", async () => {
    const repository = createRepository({
      findCommunityMemberById: vi.fn(async () => ({
        id: "member-active-1",
        userId: "user-active-1",
        communityId: "community-1",
        role: CommunityMemberRole.NEIGHBOR,
        status: CommunityMemberStatus.ACTIVE,
      })),
    });

    await expect(
      rejectCommunityMember(validInput, { repository }),
    ).rejects.toThrow("Only PENDING members can be rejected");
  });

  it("rechaza communityId vacio", async () => {
    await expect(
      rejectCommunityMember(
        { ...validInput, communityId: "   " },
        { repository: createRepository() },
      ),
    ).rejects.toThrow("communityId is required");
  });

  it("rechaza memberId vacio", async () => {
    await expect(
      rejectCommunityMember(
        { ...validInput, memberId: "   " },
        { repository: createRepository() },
      ),
    ).rejects.toThrow("memberId is required");
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
      rejectCommunityMember(validInput, { repository }),
    ).rejects.toThrow("Community is not active");

    expect(repository.updateCommunityMember).not.toHaveBeenCalled();
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
      rejectCommunityMember(validInput, { repository }),
    ).rejects.toThrow("Community is not active");

    expect(repository.updateCommunityMember).not.toHaveBeenCalled();
    expect(repository.createAuditLog).not.toHaveBeenCalled();
  });
});
