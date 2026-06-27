import { describe, expect, it, vi } from "vitest";

import {
  AuditAction,
  CommunityMemberRole,
  CommunityMemberStatus,
  CommunityStatus,
  PlatformRole,
} from "../../generated/prisma/enums";
import {
  createCommunityWithFirstAdmin,
  type PlatformCommunityRepository,
} from "./create-community-with-first-admin";

function createRepository(overrides: Partial<PlatformCommunityRepository> = {}) {
  const repository: PlatformCommunityRepository = {
    createCommunity: vi.fn(async (input) => ({
      id: "community-1",
      ...input,
    })),
    upsertUserByAuthProviderId: vi.fn(async (input) => ({
      id: "user-admin-1",
      authProviderId: input.authProviderId,
      email: input.email,
      name: input.name ?? null,
      platformRole: null,
    })),
    findCommunityMemberByUserId: vi.fn(async () => null),
    createCommunityMember: vi.fn(async (input) => ({
      id: "member-admin-1",
      ...input,
    })),
    createAuditLog: vi.fn(async () => undefined),
    runInTransaction: vi.fn(async (operation) => operation(repository)),
    ...overrides,
  };

  return repository;
}

const validInput = {
  actor: {
    id: "22222222-2222-2222-2222-222222222222",
    platformRole: PlatformRole.PLATFORM_ADMIN,
  },
  community: {
    name: "Barrio Norte",
    address: "Entrada principal",
  },
  firstAdmin: {
    authProviderId: "11111111-1111-1111-1111-111111111111",
    email: "Admin@Comunidad.cl",
    name: "Admin Comunidad",
  },
};

describe("createCommunityWithFirstAdmin", () => {
  it("permite que PLATFORM_ADMIN cree una comunidad ACTIVE con primer ADMIN ACTIVE y auditoria", async () => {
    const repository = createRepository();

    const result = await createCommunityWithFirstAdmin(validInput, { repository });

    expect(result.community).toMatchObject({
      id: "community-1",
      name: "Barrio Norte",
      address: "Entrada principal",
      status: CommunityStatus.ACTIVE,
    });
    expect(result.firstAdminUser).toMatchObject({
      id: "user-admin-1",
      authProviderId: validInput.firstAdmin.authProviderId,
      email: "admin@comunidad.cl",
      name: "Admin Comunidad",
      platformRole: null,
    });
    expect(result.firstAdminMember).toMatchObject({
      id: "member-admin-1",
      userId: "user-admin-1",
      communityId: "community-1",
      role: CommunityMemberRole.ADMIN,
      status: CommunityMemberStatus.ACTIVE,
    });

    expect(repository.createCommunity).toHaveBeenCalledWith({
      name: "Barrio Norte",
      address: "Entrada principal",
      status: CommunityStatus.ACTIVE,
    });
    expect(repository.upsertUserByAuthProviderId).toHaveBeenCalledWith({
      authProviderId: validInput.firstAdmin.authProviderId,
      email: "admin@comunidad.cl",
      name: "Admin Comunidad",
    });
    expect(repository.createCommunityMember).toHaveBeenCalledWith({
      userId: "user-admin-1",
      communityId: "community-1",
      role: CommunityMemberRole.ADMIN,
      status: CommunityMemberStatus.ACTIVE,
    });
    expect(repository.createAuditLog).toHaveBeenCalledWith({
      communityId: "community-1",
      actorId: validInput.actor.id,
      action: AuditAction.COMMUNITY_CREATED,
      entityType: "Community",
      entityId: "community-1",
      metadata: {
        communityName: "Barrio Norte",
        firstAdminUserId: "user-admin-1",
        firstAdminMemberId: "member-admin-1",
      },
    });
  });

  it("rechaza actores sin PLATFORM_ADMIN antes de crear datos", async () => {
    const repository = createRepository();

    await expect(
      createCommunityWithFirstAdmin(
        { ...validInput, actor: { id: "neighbor-1", platformRole: null } },
        { repository },
      ),
    ).rejects.toThrow("Only PLATFORM_ADMIN can create communities");

    expect(repository.createCommunity).not.toHaveBeenCalled();
    expect(repository.createAuditLog).not.toHaveBeenCalled();
    expect(repository.runInTransaction).not.toHaveBeenCalled();
  });

  it("rechaza un actor con id vacio", async () => {
    const repository = createRepository();

    await expect(
      createCommunityWithFirstAdmin(
        { ...validInput, actor: { id: "   ", platformRole: PlatformRole.PLATFORM_ADMIN } },
        { repository },
      ),
    ).rejects.toThrow("Actor id is required");

    expect(repository.runInTransaction).not.toHaveBeenCalled();
  });

  it("rechaza un actor con id que no es UUID", async () => {
    const repository = createRepository();

    await expect(
      createCommunityWithFirstAdmin(
        { ...validInput, actor: { id: "not-a-uuid", platformRole: PlatformRole.PLATFORM_ADMIN } },
        { repository },
      ),
    ).rejects.toThrow("Actor id must be a valid UUID");

    expect(repository.runInTransaction).not.toHaveBeenCalled();
  });

  it("rechaza nombre de comunidad vacio", async () => {
    const repository = createRepository();

    await expect(
      createCommunityWithFirstAdmin(
        { ...validInput, community: { ...validInput.community, name: "   " } },
        { repository },
      ),
    ).rejects.toThrow("Community name is required");

    expect(repository.runInTransaction).not.toHaveBeenCalled();
  });

  it("rechaza email vacio del primer admin", async () => {
    const repository = createRepository();

    await expect(
      createCommunityWithFirstAdmin(
        { ...validInput, firstAdmin: { ...validInput.firstAdmin, email: "   " } },
        { repository },
      ),
    ).rejects.toThrow("First admin email is required");

    expect(repository.runInTransaction).not.toHaveBeenCalled();
  });

  it("rechaza email con formato invalido del primer admin", async () => {
    const repository = createRepository();

    await expect(
      createCommunityWithFirstAdmin(
        { ...validInput, firstAdmin: { ...validInput.firstAdmin, email: "no-es-email" } },
        { repository },
      ),
    ).rejects.toThrow("First admin email is invalid");

    expect(repository.runInTransaction).not.toHaveBeenCalled();
  });

  it("rechaza authProviderId vacio del primer admin", async () => {
    const repository = createRepository();

    await expect(
      createCommunityWithFirstAdmin(
        { ...validInput, firstAdmin: { ...validInput.firstAdmin, authProviderId: "   " } },
        { repository },
      ),
    ).rejects.toThrow("First admin authProviderId is required");

    expect(repository.runInTransaction).not.toHaveBeenCalled();
  });

  it("rechaza authProviderId que no es UUID del primer admin", async () => {
    const repository = createRepository();

    await expect(
      createCommunityWithFirstAdmin(
        { ...validInput, firstAdmin: { ...validInput.firstAdmin, authProviderId: "no-es-uuid" } },
        { repository },
      ),
    ).rejects.toThrow("First admin authProviderId must be a valid UUID");

    expect(repository.runInTransaction).not.toHaveBeenCalled();
  });

  it("rechaza un primer administrador que ya pertenece a una comunidad", async () => {
    const repository = createRepository({
      findCommunityMemberByUserId: vi.fn(async () => ({
        id: "existing-member-1",
        userId: "user-admin-1",
        communityId: "other-community-1",
      })),
    });

    await expect(createCommunityWithFirstAdmin(validInput, { repository })).rejects.toThrow(
      "First admin already belongs to a community in the MVP",
    );

    expect(repository.runInTransaction).toHaveBeenCalled();
    expect(repository.findCommunityMemberByUserId).toHaveBeenCalledWith("user-admin-1");
    expect(repository.createCommunity).not.toHaveBeenCalled();
    expect(repository.createCommunityMember).not.toHaveBeenCalled();
    expect(repository.createAuditLog).not.toHaveBeenCalled();
  });
});
