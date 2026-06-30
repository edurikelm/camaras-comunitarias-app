/**
 * Tests para joinAuthorizedRoom.
 *
 * 5 tests del ADR-0017 PR #2:
 * 1. allows joining community room when user is ACTIVE member
 * 2. refuses joining community room when user is PENDING or not member
 * 3. allows joining sector room only when member's sectorId matches
 * 4. allows joining user room only when userId matches socket.data.userId
 * 5. allows joining roleAdminGuard room when member.role in [ADMIN, GUARD]
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Socket } from "socket.io";
// @ts-ignore TS6059 — el path resolve via tsconfig paths (paths lo hace innecesario), se deja para documentar el cross-project
import type { MembershipLookupsPort } from "../../../../src/domain/community/membership/membership-lookups";
import { joinAuthorizedRoom } from "./join-authorized-room.js";
// @ts-ignore TS6059 — el path resolve via tsconfig paths (paths lo hace innecesario), se deja para documentar el cross-project
import { communityRoom, sectorRoom, userRoom, roleAdminGuardRoom } from "../../../../packages/shared/src/realtime/rooms";

// --- Helpers ---

function createMockSocket(userId: string): Socket {
  return {
    data: { userId },
    join: vi.fn().mockResolvedValue(undefined),
  } as unknown as Socket;
}

function createMockLookups(): MembershipLookupsPort {
  return {
    findCommunityById: vi.fn(),
    findActiveAdminMember: vi.fn(),
    findActiveNeighborOrGuardMember: vi.fn(),
    findActiveMember: vi.fn(),
    findActiveAdminOrGuardMember: vi.fn(),
    findSectorById: vi.fn(),
  };
}

// --- Tests ---

describe("joinAuthorizedRoom", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("allows joining community room when user is ACTIVE member", async () => {
    const socket = createMockSocket("user-123");
    const lookups = createMockLookups();
    const communityId = "community-abc";

    vi.mocked(lookups.findActiveMember).mockResolvedValue({
      id: "member-1",
      userId: "user-123",
      communityId,
      role: "NEIGHBOR",
      status: "ACTIVE",
    });

    const result = await joinAuthorizedRoom(socket, lookups, { kind: "community", communityId });

    expect(result).toEqual({ joined: true, room: communityRoom(communityId) });
    expect(socket.join).toHaveBeenCalledWith(communityRoom(communityId));
  });

  it("refuses joining community room when user is PENDING or not member", async () => {
    const socket = createMockSocket("user-123");
    const lookups = createMockLookups();

    vi.mocked(lookups.findActiveMember).mockResolvedValue(null);

    const result = await joinAuthorizedRoom(socket, lookups, { kind: "community", communityId: "community-xyz" });

    expect(result).toEqual({ joined: false, reason: "not_member" });
    expect(socket.join).not.toHaveBeenCalled();
  });

  it("allows joining sector room only when member's sectorId matches", async () => {
    const userId = "user-456";
    const communityId = "community-abc";
    const sectorId = "sector-123";
    const socket = createMockSocket(userId);
    const lookups = createMockLookups();

    vi.mocked(lookups.findActiveMember).mockResolvedValue({
      id: "member-1",
      userId,
      communityId,
      sectorId,
      role: "NEIGHBOR",
      status: "ACTIVE",
    });

    const result = await joinAuthorizedRoom(socket, lookups, {
      kind: "sector",
      communityId,
      sectorId,
    });

    expect(result).toEqual({ joined: true, room: sectorRoom(sectorId) });
    expect(socket.join).toHaveBeenCalledWith(sectorRoom(sectorId));
  });

  it("refuses joining sector room when member's sectorId does not match", async () => {
    const userId = "user-789";
    const communityId = "community-abc";
    const socket = createMockSocket(userId);
    const lookups = createMockLookups();

    vi.mocked(lookups.findActiveMember).mockResolvedValue({
      id: "member-1",
      userId,
      communityId,
      sectorId: "other-sector",
      role: "NEIGHBOR",
      status: "ACTIVE",
    });

    const result = await joinAuthorizedRoom(socket, lookups, {
      kind: "sector",
      communityId,
      sectorId: "sector-123",
    });

    expect(result).toEqual({ joined: false, reason: "not_in_sector" });
    expect(socket.join).not.toHaveBeenCalled();
  });

  it("allows joining user room only when userId matches socket.data.userId", async () => {
    const userId = "user-123";
    const socket = createMockSocket(userId);
    const lookups = createMockLookups();

    const result = await joinAuthorizedRoom(socket, lookups, { kind: "user", userId });

    expect(result).toEqual({ joined: true, room: userRoom(userId) });
    expect(socket.join).toHaveBeenCalledWith(userRoom(userId));
  });

  it("refuses joining user room when userId does not match socket.data.userId", async () => {
    const socket = createMockSocket("user-123");
    const lookups = createMockLookups();

    const result = await joinAuthorizedRoom(socket, lookups, { kind: "user", userId: "other-user" });

    expect(result).toEqual({ joined: false, reason: "not_owner" });
    expect(socket.join).not.toHaveBeenCalled();
  });

  it("allows joining roleAdminGuard room when member.role in [ADMIN, GUARD]", async () => {
    const userId = "admin-user";
    const communityId = "community-abc";
    const socket = createMockSocket(userId);
    const lookups = createMockLookups();

    vi.mocked(lookups.findActiveAdminOrGuardMember).mockResolvedValue({
      id: "member-1",
      userId,
      communityId,
      role: "ADMIN",
      status: "ACTIVE",
    });

    const result = await joinAuthorizedRoom(socket, lookups, { kind: "roleAdminGuard", communityId });

    expect(result).toEqual({ joined: true, room: roleAdminGuardRoom(communityId) });
    expect(socket.join).toHaveBeenCalledWith(roleAdminGuardRoom(communityId));
  });

  it("refuses joining roleAdminGuard room when user is not ADMIN or GUARD", async () => {
    const userId = "neighbor-user";
    const communityId = "community-abc";
    const socket = createMockSocket(userId);
    const lookups = createMockLookups();

    vi.mocked(lookups.findActiveAdminOrGuardMember).mockResolvedValue(null);

    const result = await joinAuthorizedRoom(socket, lookups, { kind: "roleAdminGuard", communityId });

    expect(result).toEqual({ joined: false, reason: "not_admin_or_guard" });
    expect(socket.join).not.toHaveBeenCalled();
  });

  it("returns no_user_in_socket_data when socket.data.userId is missing", async () => {
    const socket = { data: {} } as Socket;
    const lookups = createMockLookups();

    const result = await joinAuthorizedRoom(socket, lookups, { kind: "user", userId: "any" });

    expect(result).toEqual({ joined: false, reason: "no_user_in_socket_data" });
  });
});
