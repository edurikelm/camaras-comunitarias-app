/**
 * Tests para bindConnectionHandlers.
 *
 * 3 tests del ADR-0017 PR #2:
 * 1. a user with 1 ACTIVE membership joins userRoom + communityRoom + roleAdminGuardRoom if ADMIN/GUARD
 * 2. a PENDING user joins only userRoom and no community rooms
 * 3. a user with sectorId joins sectorRoom in addition to communityRoom
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Server, Socket } from "socket.io";
// @ts-expect-error TS2307 — el path resuelve via tsconfig paths pero la extension .ts genera error de "cannot find module"
import type { PrismaClient } from "../../../src/generated/prisma/client.ts";
// @ts-ignore TS6059 — el path resolve via tsconfig paths (paths lo hace innecesario), se deja para documentar el cross-project
import type { MembershipLookupsPort } from "../../../../src/domain/community/membership/membership-lookups";
import type { Logger } from "../logger.js";
import { bindConnectionHandlers } from "./on-connection.js";
// @ts-ignore TS6059 — el path resolve via tsconfig paths (paths lo hace innecesario), se deja para documentar el cross-project
import { communityRoom, sectorRoom, userRoom, roleAdminGuardRoom } from "../../../../packages/shared/src/realtime/rooms";

// --- Helpers ---

const infoMock = vi.fn<() => void>();
const warnMock = vi.fn<() => void>();
const errorMock = vi.fn<() => void>();
const debugMock = vi.fn<() => void>();
const mockLogger = {
  info: infoMock,
  warn: warnMock,
  error: errorMock,
  debug: debugMock,
  fatal: vi.fn<() => void>(),
  trace: vi.fn<() => void>(),
} as unknown as Logger;

function createMockSocket(userId: string): Socket {
  return {
    id: `socket-${userId}`,
    data: { userId },
    join: vi.fn().mockResolvedValue(undefined),
    disconnect: vi.fn(),
    on: vi.fn(),
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

describe("bindConnectionHandlers", () => {
  beforeEach(() => {
    infoMock.mockClear();
    warnMock.mockClear();
    errorMock.mockClear();
    debugMock.mockClear();
  });

  it("a user with 1 ACTIVE membership joins userRoom + communityRoom + roleAdminGuardRoom if ADMIN/GUARD", async () => {
    const userId = "user-admin-123";
    const communityId = "community-abc";
    const socket = createMockSocket(userId);
    const lookups = createMockLookups();
    const mockPrisma = {
      communityMember: {
        findMany: vi.fn().mockResolvedValue([
          { communityId, sectorId: null, role: "ADMIN" },
        ]),
      },
    } as unknown as PrismaClient;

    // Mock findActiveMember para que retorne el miembro (necesario para joinAuthorizedRoom)
    vi.mocked(lookups.findActiveMember).mockResolvedValue({
      id: "member-1",
      userId,
      communityId,
      role: "ADMIN",
      status: "ACTIVE",
    } as const);
    // Mock findActiveAdminOrGuardMember para el caso roleAdminGuard
    vi.mocked(lookups.findActiveAdminOrGuardMember).mockResolvedValue({
      id: "member-1",
      userId,
      communityId,
      role: "ADMIN",
      status: "ACTIVE",
    } as const);

    // Capturar el handler de connection
    let capturedHandler: ((socket: Socket) => Promise<void>) | undefined;
    const mockIo = {
      on: vi.fn((event: string, handler: (socket: Socket) => Promise<void>) => {
        if (event === "connection") {
          capturedHandler = handler;
        }
      }),
      off: vi.fn(),
    } as unknown as Server;

    bindConnectionHandlers(mockIo, mockPrisma, lookups, mockLogger);

    expect(capturedHandler).toBeDefined();
    await capturedHandler!(socket);

    // Verificar que se unio a userRoom, communityRoom y roleAdminGuardRoom
    expect(socket.join).toHaveBeenCalledWith(userRoom(userId));
    expect(socket.join).toHaveBeenCalledWith(communityRoom(communityId));
    expect(socket.join).toHaveBeenCalledWith(roleAdminGuardRoom(communityId));
    expect(socket.disconnect).not.toHaveBeenCalled();
    expect(infoMock).toHaveBeenCalledWith(
      { userId, communitiesCount: 1 },
      "[realtime] connection.established",
    );
  });

  it("a PENDING user joins only userRoom and no community rooms", async () => {
    const userId = "user-pending-456";
    const socket = createMockSocket(userId);
    const lookups = createMockLookups();
    const mockPrisma = {
      communityMember: {
        findMany: vi.fn().mockResolvedValue([]), // Sin membresias ACTIVE
      },
    } as unknown as PrismaClient;

    let capturedHandler: ((socket: Socket) => Promise<void>) | undefined;
    const mockIo = {
      on: vi.fn((event: string, handler: (socket: Socket) => Promise<void>) => {
        if (event === "connection") {
          capturedHandler = handler;
        }
      }),
      off: vi.fn(),
    } as unknown as Server;

    bindConnectionHandlers(mockIo, mockPrisma, lookups, mockLogger);

    expect(capturedHandler).toBeDefined();
    await capturedHandler!(socket);

    // Solo debe unirse a su userRoom personal
    expect(socket.join).toHaveBeenCalledWith(userRoom(userId));
    expect(socket.join).not.toHaveBeenCalledWith(expect.stringContaining("community"));
    expect(socket.join).not.toHaveBeenCalledWith(expect.stringContaining("sector"));
    expect(infoMock).toHaveBeenCalledWith(
      { userId, communitiesCount: 0 },
      "[realtime] connection.established",
    );
  });

  it("a user with sectorId joins sectorRoom in addition to communityRoom", async () => {
    const userId = "user-neighbor-789";
    const communityId = "community-xyz";
    const sectorId = "sector-123";
    const socket = createMockSocket(userId);
    const lookups = createMockLookups();
    const mockPrisma = {
      communityMember: {
        findMany: vi.fn().mockResolvedValue([
          { communityId, sectorId, role: "NEIGHBOR" },
        ]),
      },
    } as unknown as PrismaClient;

    // Mock findActiveMember para que retorne el miembro con sectorId
    vi.mocked(lookups.findActiveMember).mockResolvedValue({
      id: "member-1",
      userId,
      communityId,
      sectorId,
      role: "NEIGHBOR",
      status: "ACTIVE",
    });

    let capturedHandler: ((socket: Socket) => Promise<void>) | undefined;
    const mockIo = {
      on: vi.fn((event: string, handler: (socket: Socket) => Promise<void>) => {
        if (event === "connection") {
          capturedHandler = handler;
        }
      }),
      off: vi.fn(),
    } as unknown as Server;

    bindConnectionHandlers(mockIo, mockPrisma, lookups, mockLogger);

    expect(capturedHandler).toBeDefined();
    await capturedHandler!(socket);

    // Debe unirse a userRoom, communityRoom y sectorRoom (no roleAdminGuard porque es NEIGHBOR)
    expect(socket.join).toHaveBeenCalledWith(userRoom(userId));
    expect(socket.join).toHaveBeenCalledWith(communityRoom(communityId));
    expect(socket.join).toHaveBeenCalledWith(sectorRoom(sectorId));
    expect(socket.join).not.toHaveBeenCalledWith(roleAdminGuardRoom(communityId));
    expect(infoMock).toHaveBeenCalledWith(
      { userId, communitiesCount: 1 },
      "[realtime] connection.established",
    );
  });

  it("disconnects socket when userId is missing in socket.data (defense in depth)", async () => {
    const socket = createMockSocket("");
    socket.data = {}; // Sin userId
    const lookups = createMockLookups();
    const mockPrisma = {} as PrismaClient;

    let capturedHandler: ((socket: Socket) => Promise<void>) | undefined;
    const mockIo = {
      on: vi.fn((event: string, handler: (socket: Socket) => Promise<void>) => {
        if (event === "connection") {
          capturedHandler = handler;
        }
      }),
      off: vi.fn(),
    } as unknown as Server;

    bindConnectionHandlers(mockIo, mockPrisma, lookups, mockLogger);

    expect(capturedHandler).toBeDefined();
    await capturedHandler!(socket);

    expect(socket.disconnect).toHaveBeenCalledWith(true);
    expect(warnMock).toHaveBeenCalledWith(
      { socketId: socket.id },
      "[realtime] connection rejected: no userId",
    );
  });

  it("disconnects socket when prisma throws (connection_handler_failed)", async () => {
    const userId = "user-error-999";
    const socket = createMockSocket(userId);
    const lookups = createMockLookups();
    const mockPrisma = {
      communityMember: {
        findMany: vi.fn().mockRejectedValue(new Error("connection refused")),
      },
    } as unknown as PrismaClient;

    let capturedHandler: ((socket: Socket) => Promise<void>) | undefined;
    const mockIo = {
      on: vi.fn((event: string, handler: (socket: Socket) => Promise<void>) => {
        if (event === "connection") {
          capturedHandler = handler;
        }
      }),
      off: vi.fn(),
    } as unknown as Server;

    bindConnectionHandlers(mockIo, mockPrisma, lookups, mockLogger);

    expect(capturedHandler).toBeDefined();
    await capturedHandler!(socket);

    expect(socket.disconnect).toHaveBeenCalledWith(true);
    expect(errorMock).toHaveBeenCalledWith(
      expect.objectContaining({ reason: "connection_handler_failed", userId }),
      "[realtime] connection.error",
    );
  });
});
