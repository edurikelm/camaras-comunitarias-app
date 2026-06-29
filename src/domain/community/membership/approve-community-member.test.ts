import { describe, expect, it, vi } from "vitest";
import {
  AuditAction,
  CommunityMemberRole,
  CommunityMemberStatus,
  CommunityStatus,
} from "@/generated/prisma/enums";
import { approveCommunityMember } from "./approve-community-member";
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
    findActiveNeighborOrGuardMember: vi.fn(),
    findActiveMember: vi.fn(),
    findActiveAdminOrGuardMember: vi.fn(),
    findSectorById: vi.fn(),
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
      role: (input.role ?? CommunityMemberRole.NEIGHBOR) as CommunityMemberRole,
      status: (input.status ?? CommunityMemberStatus.ACTIVE) as CommunityMemberStatus,
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
  role: CommunityMemberRole.NEIGHBOR,
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("approveCommunityMember", () => {
  it("aprueba miembro PENDING como NEIGHBOR y audita", async () => {
    const repository = createRepository();

    const result = await approveCommunityMember(validInput, { repository });

    expect(result.member).toMatchObject({
      id: "member-pending-1",
      communityId: "community-1",
      role: CommunityMemberRole.NEIGHBOR,
      status: CommunityMemberStatus.ACTIVE,
    });

    expect(repository.updateCommunityMember).toHaveBeenCalledWith(
      "member-pending-1",
      {
        status: CommunityMemberStatus.ACTIVE,
        role: CommunityMemberRole.NEIGHBOR,
      },
    );

    expect(repository.createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: AuditAction.MEMBER_APPROVED,
        entityType: "CommunityMember",
        entityId: "member-pending-1",
        communityId: "community-1",
        actorId: "user-admin-1",
      }),
    );
  });

  it("aprueba miembro PENDING como GUARD", async () => {
    const repository = createRepository();

    const result = await approveCommunityMember(
      { ...validInput, role: CommunityMemberRole.GUARD },
      { repository },
    );

    expect(result.member.role).toBe(CommunityMemberRole.GUARD);
    expect(result.member.status).toBe(CommunityMemberStatus.ACTIVE);
  });

  it("rechaza si el actor no es ADMIN ACTIVE", async () => {
    const repository = createRepository({
      findActiveAdminMember: vi.fn(async () => null),
    });

    await expect(
      approveCommunityMember(validInput, { repository }),
    ).rejects.toThrow("Only an ACTIVE ADMIN can approve members");

    expect(repository.updateCommunityMember).not.toHaveBeenCalled();
    expect(repository.createAuditLog).not.toHaveBeenCalled();
  });

  it("rechaza si el miembro objetivo no existe", async () => {
    const repository = createRepository({
      findCommunityMemberById: vi.fn(async () => null),
    });

    await expect(
      approveCommunityMember(validInput, { repository }),
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
      approveCommunityMember(validInput, { repository }),
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
      approveCommunityMember(validInput, { repository }),
    ).rejects.toThrow("Only PENDING members can be approved");
  });

  it("rechaza rol ADMIN en aprobacion", async () => {
    await expect(
      approveCommunityMember(
        { ...validInput, role: CommunityMemberRole.ADMIN },
        { repository: createRepository() },
      ),
    ).rejects.toThrow("Role must be NEIGHBOR or GUARD when approving a member");
  });

  it("rechaza communityId vacio", async () => {
    await expect(
      approveCommunityMember(
        { ...validInput, communityId: "   " },
        { repository: createRepository() },
      ),
    ).rejects.toThrow("communityId is required");
  });

  it("rechaza memberId vacio", async () => {
    await expect(
      approveCommunityMember(
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
      approveCommunityMember(validInput, { repository }),
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
      approveCommunityMember(validInput, { repository }),
    ).rejects.toThrow("Community is not active");

    expect(repository.updateCommunityMember).not.toHaveBeenCalled();
    expect(repository.createAuditLog).not.toHaveBeenCalled();
  });
});
