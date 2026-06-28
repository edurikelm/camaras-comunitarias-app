import {
  AuditAction,
  CommunityMemberRole,
  CommunityMemberStatus,
  CommunityStatus,
  PlatformRole,
  type PlatformRole as PlatformRoleValue,
} from "../../generated/prisma/enums";
import {
  CommunityAuthorizationError,
  CommunityInvariantError,
} from "@/domain/community/errors";
import { isUuid } from "@/domain/shared/validators";

/**
 * Platform-scoped authorization failure (actor lacks PLATFORM_ADMIN role).
 *
 * Extends `CommunityAuthorizationError` so the shared `DomainErrorMapper`
 * (see ADR-0007 + ADR-0009) maps it to HTTP 403 via `instanceof`. Keeping
 * the subclass preserves semantic locality: callers and logs see
 * `PlatformAuthorizationError` as the name, while the mapper recognizes the
 * parent class.
 */
export class PlatformAuthorizationError extends CommunityAuthorizationError {
  constructor(message = "Only PLATFORM_ADMIN can create communities") {
    super(message);
    this.name = "PlatformAuthorizationError";
  }
}

/**
 * Invariant violation during community creation flow at the platform level
 * (e.g. malformed UUID, duplicate membership). Extends `CommunityInvariantError`
 * so the shared mapper maps it to HTTP 400.
 */
export class CommunityCreationInvariantError extends CommunityInvariantError {
  constructor(message: string) {
    super(message);
    this.name = "CommunityCreationInvariantError";
  }
}

type PlatformActor = {
  id: string;
  platformRole: PlatformRoleValue | null;
};

type FirstAdminInput = {
  authProviderId: string;
  email: string;
  name?: string | null;
};

export type CreateCommunityWithFirstAdminInput = {
  actor: PlatformActor;
  community: {
    name: string;
    address?: string | null;
  };
  firstAdmin: FirstAdminInput;
};

type CommunityRecord = {
  id: string;
  name: string;
  address: string | null;
  status: CommunityStatus;
};

type UserRecord = {
  id: string;
  authProviderId: string;
  email: string;
  name: string | null;
  platformRole: PlatformRoleValue | null;
};

type CommunityMemberRecord = {
  id: string;
  userId: string;
  communityId: string;
  role: CommunityMemberRole;
  status: CommunityMemberStatus;
};

type ExistingCommunityMember = {
  id: string;
  userId: string;
  communityId: string;
};

type CreateAuditLogInput = {
  communityId: string;
  actorId: string;
  action: AuditAction;
  entityType: "Community";
  entityId: string;
  metadata: {
    communityName: string;
    firstAdminUserId: string;
    firstAdminMemberId: string;
  };
};

export type PlatformCommunityUnitOfWork = {
  createCommunity(input: {
    name: string;
    address: string | null;
    status: CommunityStatus;
  }): Promise<CommunityRecord>;
  upsertUserByAuthProviderId(input: FirstAdminInput): Promise<UserRecord>;
  findCommunityMemberByUserId(userId: string): Promise<ExistingCommunityMember | null>;
  createCommunityMember(input: {
    userId: string;
    communityId: string;
    role: CommunityMemberRole;
    status: CommunityMemberStatus;
  }): Promise<CommunityMemberRecord>;
  createAuditLog(input: CreateAuditLogInput): Promise<void>;
};

export type PlatformCommunityRepository = PlatformCommunityUnitOfWork & {
  runInTransaction<T>(operation: (repository: PlatformCommunityUnitOfWork) => Promise<T>): Promise<T>;
};

export type CreateCommunityWithFirstAdminDeps = {
  repository: PlatformCommunityRepository;
};

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isEmail(value: string) {
  return EMAIL_REGEX.test(value);
}

export async function createCommunityWithFirstAdmin(
  input: CreateCommunityWithFirstAdminInput,
  { repository }: CreateCommunityWithFirstAdminDeps,
) {
  if (input.actor.platformRole !== PlatformRole.PLATFORM_ADMIN) {
    throw new PlatformAuthorizationError();
  }

  const actorId = input.actor.id.trim();
  if (!actorId) {
    throw new CommunityCreationInvariantError("Actor id is required");
  }
  if (!isUuid(actorId)) {
    throw new CommunityCreationInvariantError("Actor id must be a valid UUID");
  }

  const communityName = input.community.name.trim();
  if (!communityName) {
    throw new CommunityCreationInvariantError("Community name is required");
  }

  const firstAdminEmail = input.firstAdmin.email.trim().toLowerCase();
  if (!firstAdminEmail) {
    throw new CommunityCreationInvariantError("First admin email is required");
  }
  if (!isEmail(firstAdminEmail)) {
    throw new CommunityCreationInvariantError("First admin email is invalid");
  }

  const authProviderId = input.firstAdmin.authProviderId.trim();
  if (!authProviderId) {
    throw new CommunityCreationInvariantError("First admin authProviderId is required");
  }
  if (!isUuid(authProviderId)) {
    throw new CommunityCreationInvariantError("First admin authProviderId must be a valid UUID");
  }

  return repository.runInTransaction(async (transaction) => {
    const firstAdminUser = await transaction.upsertUserByAuthProviderId({
      authProviderId,
      email: firstAdminEmail,
      name: input.firstAdmin.name?.trim() || null,
    });

    const existingMembership = await transaction.findCommunityMemberByUserId(firstAdminUser.id);
    if (existingMembership) {
      throw new CommunityCreationInvariantError(
        "First admin already belongs to a community in the MVP",
      );
    }

    const community = await transaction.createCommunity({
      name: communityName,
      address: input.community.address?.trim() || null,
      status: CommunityStatus.ACTIVE,
    });

    const firstAdminMember = await transaction.createCommunityMember({
      userId: firstAdminUser.id,
      communityId: community.id,
      role: CommunityMemberRole.ADMIN,
      status: CommunityMemberStatus.ACTIVE,
    });

    await transaction.createAuditLog({
      communityId: community.id,
      actorId,
      action: AuditAction.COMMUNITY_CREATED,
      entityType: "Community",
      entityId: community.id,
      metadata: {
        communityName: community.name,
        firstAdminUserId: firstAdminUser.id,
        firstAdminMemberId: firstAdminMember.id,
      },
    });

    return {
      community,
      firstAdminUser,
      firstAdminMember,
    };
  });
}
