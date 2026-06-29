import type {
  CommunityMemberRole,
  CommunityMemberStatus,
  CommunityStatus,
} from "@/generated/prisma/enums";

/**
 * Represents a community lookup result returned by the membership lookups port.
 */
export type CommunityLookupRecord = {
  id: string;
  name: string;
  status: CommunityStatus;
};

/**
 * Represents a community member lookup result returned by the membership lookups port.
 */
export type MemberLookupRecord = {
  id: string;
  userId: string;
  communityId: string;
  role: CommunityMemberRole;
  status: CommunityMemberStatus;
};

/**
 * Represents a community sector lookup result returned by the membership lookups port.
 */
export type SectorLookupRecord = {
  id: string;
  communityId: string;
  name: string;
};

/**
 * Port for reading community, membership, and sector data.
 *
 * Implemented by infrastructure adapters (e.g. Prisma) and used inside
 * repository unit-of-work functions so that domain services can perform
 * contextual lookups (community existence, member roles, sector data)
 * without coupling to a specific persistence technology.
 *
 * All lookups are read-only.  The adapter is constructed inside each
 * repository's `createUnitOfWork` so that reads are consistent with
 * in-flight writes within the same transaction.
 */
export interface MembershipLookupsPort {
  findCommunityById(id: string): Promise<CommunityLookupRecord | null>;
  findActiveAdminMember(
    communityId: string,
    userId: string,
  ): Promise<MemberLookupRecord | null>;
  findActiveNeighborOrGuardMember(
    communityId: string,
    userId: string,
  ): Promise<MemberLookupRecord | null>;
  findActiveMember(
    communityId: string,
    userId: string,
  ): Promise<MemberLookupRecord | null>;
  findActiveAdminOrGuardMember(
    communityId: string,
    userId: string,
  ): Promise<MemberLookupRecord | null>;
  findSectorById(sectorId: string): Promise<SectorLookupRecord | null>;
}
