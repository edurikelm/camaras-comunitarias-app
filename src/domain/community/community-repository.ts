import {
  AuditAction,
  CommunityMemberRole,
  CommunityMemberStatus,
  CommunityStatus,
} from "@/generated/prisma/enums";

// ---------------------------------------------------------------------------
// Record types returned by repository methods
// ---------------------------------------------------------------------------

export type CommunityRecord = {
  id: string;
  name: string;
  status: CommunityStatus;
};

export type CommunityMemberRecord = {
  id: string;
  userId: string;
  communityId: string;
  role: CommunityMemberRole;
  status: CommunityMemberStatus;
};

export type InvitationRecord = {
  id: string;
  communityId: string;
  codeHash: string;
  expiresAt: Date | null;
  usedAt: Date | null;
  revokedAt: Date | null;
  createdAt: Date;
};

// ---------------------------------------------------------------------------
// Input types
// ---------------------------------------------------------------------------

export type CreateInvitationInput = {
  communityId: string;
  codeHash: string;
  createdById: string | null;
  expiresAt: Date | null;
};

export type CreateMemberInput = {
  userId: string;
  communityId: string;
  role: CommunityMemberRole;
  status: CommunityMemberStatus;
};

export type UpdateMemberInput = {
  role?: CommunityMemberRole;
  status?: CommunityMemberStatus;
};

export type CreateAuditLogInput = {
  communityId: string;
  actorId: string;
  action: AuditAction;
  entityType: string;
  entityId: string;
  metadata?: Record<string, unknown>;
};

// ---------------------------------------------------------------------------
// Unit of work (scoped inside a transaction)
// ---------------------------------------------------------------------------

export interface CommunityUnitOfWork {
  findCommunityById(id: string): Promise<CommunityRecord | null>;
  findActiveAdminMember(
    communityId: string,
    userId: string,
  ): Promise<CommunityMemberRecord | null>;
  findCommunityMemberByUserId(
    userId: string,
  ): Promise<CommunityMemberRecord | null>;
  findCommunityMemberById(
    id: string,
  ): Promise<CommunityMemberRecord | null>;
  findInvitationByCodeHash(
    codeHash: string,
  ): Promise<InvitationRecord | null>;
  createCommunityInvitation(
    input: CreateInvitationInput,
  ): Promise<InvitationRecord>;
  markInvitationUsedIfAvailable(id: string): Promise<boolean>;
  createCommunityMember(
    input: CreateMemberInput,
  ): Promise<CommunityMemberRecord>;
  updateCommunityMember(
    id: string,
    input: UpdateMemberInput,
  ): Promise<CommunityMemberRecord>;
  createAuditLog(input: CreateAuditLogInput): Promise<void>;
}

// ---------------------------------------------------------------------------
// Full repository (adds runInTransaction)
// ---------------------------------------------------------------------------

export interface CommunityMembershipRepository extends CommunityUnitOfWork {
  runInTransaction<T>(
    operation: (uow: CommunityUnitOfWork) => Promise<T>,
  ): Promise<T>;
}
