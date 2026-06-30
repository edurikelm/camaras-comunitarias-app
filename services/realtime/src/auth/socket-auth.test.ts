/**
 * Tests para el middleware de autenticacion JWT de Socket.IO.
 *
 * Estrategia de mocking de jose (ESM):
 * - vi.mock es hoisted al top del archivo.
 * - El factory genera un par de claves RSA y crea un JWKS local con createLocalJWKSet.
 * - createRemoteJWKSet mockeado retorna este JWKS local.
 * - jwtVerify mock hace decode del JWT y valida `exp` (sin criptografia real),
 *   porque lo que el middleware testea aqui es el flujo del handler, no jose.
 * - Los 4 tests del ADR cubren los happy paths y los 4 rejection paths diferenciados.
 *   Un 5to test cubre el path de error interno (Prisma caido) que el tester
 *   recomendo agregar para PR #2.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Server, Socket } from "socket.io";
import { registerSocketAuth, SocketAuthErrorCode } from "./socket-auth.js";
import type { Logger } from "../logger.js";
import type { PrismaUserLookup, SocketAuthDeps } from "./socket-auth.js";

const TEST_KEY_ID = "realtime-test-key";
const TEST_ISSUER = "https://example.supabase.co";
const TEST_AUDIENCE = "authenticated";

vi.mock("jose", async () => {
  const joseReal = await import("jose");
  const { jwtVerify, SignJWT, exportJWK, createRemoteJWKSet, createLocalJWKSet } = joseReal;

  const { publicKey } = await crypto.subtle.generateKey(
    { name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
    true,
    ["sign", "verify"],
  );

  const publicJwk = await exportJWK(publicKey);
  // Inline del valor (ESM/vi.mock hoisting: no se pueden usar constantes de modulo
  // dentro del factory del mock por TDZ).
  publicJwk.kid = "realtime-test-key";
  publicJwk.use = "sig";
  publicJwk.alg = "RS256";

  const localJwks = createLocalJWKSet({ keys: [publicJwk] });

  const mock = {
    createRemoteJWKSet: vi.fn<typeof createRemoteJWKSet>(),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    jwtVerify: vi.fn() as any,
    SignJWT,
    exportJWK,
    createLocalJWKSet,
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  mock.createRemoteJWKSet.mockReturnValue(localJwks as any);

  // jwtVerify mockeado: decode del JWT + check de exp.
  mock.jwtVerify.mockImplementation(async (token: string) => {
    const parts = token.split(".");
    if (parts.length !== 3) throw new Error("Invalid JWT format");
    const payloadStr = Buffer.from(parts[1]!, "base64url").toString("utf-8");
    const payload = JSON.parse(payloadStr) as { sub?: string; exp?: number };
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp && payload.exp < now) {
      const err = new Error("jwt expired") as Error & { code: string };
      err.code = "ERR_JWT_EXPIRED";
      throw err;
    }
    return { payload };
  });

  return mock;
});

// --- Helpers ---

let privateKey: CryptoKey;

const infoMock = vi.fn<() => void>();
const warnMock = vi.fn<() => void>();
const errorMock = vi.fn<() => void>();
const mockLogger = {
  info: infoMock,
  warn: warnMock,
  error: errorMock,
  debug: vi.fn<() => void>(),
  fatal: vi.fn<() => void>(),
  trace: vi.fn<() => void>(),
} as unknown as Logger;

async function buildToken(payload: Record<string, unknown>, expOffsetSeconds = 3600): Promise<string> {
  if (!privateKey) {
    const keyPair = await crypto.subtle.generateKey(
      { name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
      true,
      ["sign", "verify"],
    );
    privateKey = keyPair.privateKey;
  }
  const { SignJWT } = await import("jose");
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "RS256", kid: TEST_KEY_ID })
    .setIssuedAt(now)
    .setIssuer(TEST_ISSUER)
    .setAudience(TEST_AUDIENCE)
    .setExpirationTime(now + expOffsetSeconds)
    .sign(privateKey);
}

type SocketMiddleware = (
  socket: Socket,
  next: (err?: Error) => void,
) => Promise<void>;

/**
 * Captura el middleware pasado a `io.use(...)` para ejecutarlo directamente
 * contra un socket mockeado. Mas simple que levantar el server + cliente real.
 */
function captureMiddlewareFromRegister(
  register: (io: Server, deps: SocketAuthDeps) => void,
  deps: SocketAuthDeps,
): SocketMiddleware {
  let captured: SocketMiddleware | undefined;
  const io = {
    use: (fn: SocketMiddleware) => {
      captured = fn;
    },
  } as unknown as Server;
  register(io, deps);
  if (!captured) throw new Error("register did not call io.use()");
  return captured;
}

// --- Tests ---

describe("registerSocketAuth", () => {
  beforeEach(() => {
    infoMock.mockClear();
    warnMock.mockClear();
    errorMock.mockClear();
  });

  it("accepts a connection with a valid Supabase access token", async () => {
    const mockUsers: PrismaUserLookup = {
      findUserByAuthProviderId: vi.fn()
        .mockResolvedValue({ id: "user-uuid-123" }),
    };

    const deps = {
      jwksUrl: `${TEST_ISSUER}/auth/v1/.well-known/jwks.json`,
      jwtAudience: TEST_AUDIENCE,
      jwtIssuer: TEST_ISSUER,
      users: mockUsers,
      logger: mockLogger,
    };

    const middleware = captureMiddlewareFromRegister(registerSocketAuth, deps);

    const token = await buildToken({ sub: "supabase-user-uuid-abc" });
    const socket = { handshake: { auth: { token } }, data: {} } as unknown as Socket;
    const next = vi.fn<(err?: Error) => void>();

    await middleware(socket, next);

    expect(next).toHaveBeenCalledWith();
    expect((socket.data as Record<string, unknown>).supabaseUserId).toBe("supabase-user-uuid-abc");
    expect((socket.data as Record<string, unknown>).userId).toBe("user-uuid-123");
    expect(infoMock).toHaveBeenCalledWith({ userId: "user-uuid-123" }, "[realtime] auth.success");
  });

  it("rejects a connection without a token (next called with Error)", async () => {
    const mockUsers: PrismaUserLookup = {
      findUserByAuthProviderId: vi.fn(),
    };

    const deps = {
      jwksUrl: `${TEST_ISSUER}/auth/v1/.well-known/jwks.json`,
      jwtAudience: TEST_AUDIENCE,
      jwtIssuer: TEST_ISSUER,
      users: mockUsers,
      logger: mockLogger,
    };

    const middleware = captureMiddlewareFromRegister(registerSocketAuth, deps);

    const socket = { handshake: { auth: {} }, data: {} } as unknown as Socket;
    const next = vi.fn<(err?: Error) => void>();

    await middleware(socket, next);

    expect(next).toHaveBeenCalledWith(expect.any(Error));
    expect((next.mock.calls[0] as [Error?])[0]?.message).toBe(SocketAuthErrorCode.MissingToken);
    expect(warnMock).toHaveBeenCalledWith({ reason: "missing_token" }, "[realtime] auth.rejected");
  });

  it("rejects a connection with an empty string token as MissingToken (not Invalid)", async () => {
    // Cambio de semantica introducido en el ciclo de review: string vacio =
    // "no se proveyo token", no "token invalido".
    const mockUsers: PrismaUserLookup = {
      findUserByAuthProviderId: vi.fn(),
    };

    const deps = {
      jwksUrl: `${TEST_ISSUER}/auth/v1/.well-known/jwks.json`,
      jwtAudience: TEST_AUDIENCE,
      jwtIssuer: TEST_ISSUER,
      users: mockUsers,
      logger: mockLogger,
    };

    const middleware = captureMiddlewareFromRegister(registerSocketAuth, deps);

    const socket = { handshake: { auth: { token: "" } }, data: {} } as unknown as Socket;
    const next = vi.fn<(err?: Error) => void>();

    await middleware(socket, next);

    expect((next.mock.calls[0] as [Error?])[0]?.message).toBe(SocketAuthErrorCode.MissingToken);
  });

  it("rejects a connection with an expired token", async () => {
    const mockUsers: PrismaUserLookup = {
      findUserByAuthProviderId: vi.fn()
        .mockResolvedValue({ id: "user-uuid-123" }),
    };

    const deps = {
      jwksUrl: `${TEST_ISSUER}/auth/v1/.well-known/jwks.json`,
      jwtAudience: TEST_AUDIENCE,
      jwtIssuer: TEST_ISSUER,
      users: mockUsers,
      logger: mockLogger,
    };

    const middleware = captureMiddlewareFromRegister(registerSocketAuth, deps);

    const token = await buildToken({ sub: "supabase-user-uuid-abc" }, -60);
    const socket = { handshake: { auth: { token } }, data: {} } as unknown as Socket;
    const next = vi.fn<(err?: Error) => void>();

    await middleware(socket, next);

    expect(next).toHaveBeenCalledWith(expect.any(Error));
    expect((next.mock.calls[0] as [Error?])[0]?.message).toBe(SocketAuthErrorCode.InvalidToken);
  });

  it("rejects a connection when Supabase user has no matching User row in app DB", async () => {
    const mockUsers: PrismaUserLookup = {
      findUserByAuthProviderId: vi.fn().mockResolvedValue(null),
    };

    const deps = {
      jwksUrl: `${TEST_ISSUER}/auth/v1/.well-known/jwks.json`,
      jwtAudience: TEST_AUDIENCE,
      jwtIssuer: TEST_ISSUER,
      users: mockUsers,
      logger: mockLogger,
    };

    const middleware = captureMiddlewareFromRegister(registerSocketAuth, deps);

    const token = await buildToken({ sub: "orphan-supabase-uuid" });
    const socket = { handshake: { auth: { token } }, data: {} } as unknown as Socket;
    const next = vi.fn<(err?: Error) => void>();

    await middleware(socket, next);

    expect(next).toHaveBeenCalledWith(expect.any(Error));
    expect((next.mock.calls[0] as [Error?])[0]?.message).toBe(SocketAuthErrorCode.UserNotInDb);
    expect(warnMock).toHaveBeenCalledWith(
      { reason: "user_not_found", supabaseUserId: "orphan-supabase-uuid" },
      "[realtime] auth.rejected",
    );
  });

  it("returns InternalError (not InvalidToken) when user lookup throws — distinguishes operational failure from auth failure", async () => {
    // Path agregado tras review: cliente debe poder distinguir "token malo"
    // (reauth) de "DB caida" (reintentar sin pedir token nuevo).
    const mockUsers: PrismaUserLookup = {
      findUserByAuthProviderId: vi.fn().mockRejectedValue(new Error("connection refused")),
    };

    const deps = {
      jwksUrl: `${TEST_ISSUER}/auth/v1/.well-known/jwks.json`,
      jwtAudience: TEST_AUDIENCE,
      jwtIssuer: TEST_ISSUER,
      users: mockUsers,
      logger: mockLogger,
    };

    const middleware = captureMiddlewareFromRegister(registerSocketAuth, deps);

    const token = await buildToken({ sub: "supabase-user-uuid-abc" });
    const socket = { handshake: { auth: { token } }, data: {} } as unknown as Socket;
    const next = vi.fn<(err?: Error) => void>();

    await middleware(socket, next);

    expect(next).toHaveBeenCalledWith(expect.any(Error));
    expect((next.mock.calls[0] as [Error?])[0]?.message).toBe(SocketAuthErrorCode.InternalError);
    expect(errorMock).toHaveBeenCalled();
    // El token NO se incluye en el log — solo reason + errorMessage (sanitizado) + supabaseUserId
    const logCall = errorMock.mock.calls[0] as unknown as [unknown];
    const logged = logCall[0] && typeof logCall[0] === "object" ? (logCall[0] as Record<string, unknown>) : {};
    const loggedKeys = Object.keys(logged);
    expect(loggedKeys).toContain("reason");
    expect(loggedKeys).toContain("errorMessage");
    expect(loggedKeys).toContain("supabaseUserId");
    expect(loggedKeys).not.toContain("token");
    // El objeto `err` crudo NO se propaga (puediera contener connection strings de Prisma)
    expect(loggedKeys).not.toContain("err");
  });
});
