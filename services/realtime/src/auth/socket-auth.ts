import type { Server } from "socket.io";
import { createRemoteJWKSet, jwtVerify } from "jose";
import type { Logger } from "../logger.js";

/**
 * Codigos de error enviados al cliente Socket.IO.
 * El `reason` real (interno) NO se expone — se loguea estructuradamente en el server.
 */
export const SocketAuthErrorCode = {
  MissingToken: "AUTH_MISSING_TOKEN",
  InvalidToken: "AUTH_INVALID_TOKEN",
  UserNotInDb: "AUTH_USER_NOT_IN_DB",
  /** Fallo operativo no relacionado a la validez del token (e.g. Prisma caido).
   * Se diferencia de `InvalidToken` para que el cliente pueda decidir reintentar
   * sin pedir un token nuevo. */
  InternalError: "AUTH_INTERNAL_ERROR",
} as const;

export type SocketAuthErrorCode =
  (typeof SocketAuthErrorCode)[keyof typeof SocketAuthErrorCode];

/**
 * Tipo concreto de `socket.data` despues del handshake.
 * Las guarantees las establece `registerSocketAuth`: tras `io.on("connection")`,
 * `socket.data.userId` y `socket.data.supabaseUserId` estan populados.
 * Hasta PR #2 no hay otros consumidores — este contrato se mantiene en un solo lugar.
 *
 * **Invariante de PII**: `email` NO se popula nunca en `socket.data`. Aunque el
 * lookup a Prisma podria incluirlo, el adapter (`prisma-user-lookup.ts`) solo
 * selecciona `id`. Ver ADR-0017 seccion h (observabilidad minima): email es PII
 * y NO debe loguearse ni exponerse via Socket.IO handlers.
 */
export type SocketData = {
  supabaseUserId: string; // payload.sub de Supabase JWT (= User.authProviderId)
  userId: string; // User.id interno de la app (UUID del dominio)
};

/**
 * Port para resolver `authProviderId` (Supabase sub) -> User.id.
 * Mirror del patron de `MembershipLookupsPort`.
 */
export type PrismaUserLookup = {
  findUserByAuthProviderId(
    authProviderId: string,
  ): Promise<{ id: string } | null>;
};

export type SocketAuthDeps = {
  jwksUrl: string; // `${SUPABASE_URL}/auth/v1/.well-known/jwks.json`
  jwtAudience: string; // SUPABASE_JWT_AUDIENCE (default "authenticated")
  jwtIssuer: string; // SUPABASE_URL
  users: PrismaUserLookup;
  logger: Logger;
};

/**
 * Registra el middleware de autenticacion JWT de Supabase en el servidor Socket.IO.
 *
 * Cada handshake Socket.IO debe enviar `auth.token` con un access token de Supabase.
 * El middleware:
 *  1. Verifica la firma del JWT contra el JWKS de Supabase (validacion local, sin roundtrip).
 *  2. Resuelve `payload.sub` (Supabase user.id) contra `User.authProviderId` en la DB.
 *  3. Popula `socket.data` con `supabaseUserId` y `userId` para uso en handlers posteriores.
 *
 * Codigos de error enviados al cliente (`SocketAuthErrorCode`):
 *  - `MissingToken`: no se proveyo token.
 *  - `InvalidToken`: token invalido, expirado, o JWKS no puede verificarse.
 *  - `UserNotInDb`: token valido pero el usuario no existe en la DB de la app.
 *  - `InternalError`: fallo operativo (e.g. Prisma caido, network error). No relacionado
 *    a la validez del token. Se diferencia para que el cliente pueda decidir reintentar.
 *
 * El `reason` interno se loguea pero NUNCA se expone al cliente. PII (token, email)
 * nunca se loguea — solo `reason`, `userId` (post-auth) y `supabaseUserId` (UUID, no PII).
 */
export function registerSocketAuth(io: Server, deps: SocketAuthDeps): void {
  const JWKS = createRemoteJWKSet(new URL(deps.jwksUrl));

  io.use(async (socket, next) => {
    const rawToken = socket.handshake.auth?.token;
    if (typeof rawToken !== "string" || rawToken === "") {
      deps.logger.warn(
        { reason: "missing_token" },
        "[realtime] auth.rejected",
      );
      return next(new Error(SocketAuthErrorCode.MissingToken));
    }

    let sub: string;
    try {
      const { payload } = await jwtVerify(rawToken, JWKS, {
        audience: deps.jwtAudience,
        issuer: deps.jwtIssuer,
      });
      if (typeof payload.sub !== "string" || payload.sub === "") {
        deps.logger.warn(
          { reason: "missing_sub" },
          "[realtime] auth.rejected",
        );
        return next(new Error(SocketAuthErrorCode.InvalidToken));
      }
      sub = payload.sub;
    } catch (err) {
      // Fallo de jose (firma invalida, exp, nbf, iss, aud, etc.) -> token invalido
      deps.logger.warn(
        { reason: joseErrorReason(err) },
        "[realtime] auth.rejected",
      );
      return next(new Error(SocketAuthErrorCode.InvalidToken));
    }

    // Lookup en DB: separado del verify para distinguir "token invalido" de "DB caida"
    let user: { id: string } | null;
    try {
      user = await deps.users.findUserByAuthProviderId(sub);
    } catch (err) {
      // Fallo operativo NO relacionado al token. Se loguea como `error` y se
      // devuelve un codigo diferente para que el cliente no revoque el token.
      // NOTA: NO pasamos `err` crudo a pino — errores de Prisma pueden contener
      // connection strings, hostnames, nombres de tabla. Solo se loguea el mensaje
      // para correlacion en production. (Revisor PR #1.)
      const errorMessage = err instanceof Error ? err.message : String(err);
      deps.logger.error(
        { reason: "user_lookup_failed", errorMessage, supabaseUserId: sub },
        "[realtime] auth.error",
      );
      return next(new Error(SocketAuthErrorCode.InternalError));
    }

    if (!user) {
      deps.logger.warn(
        { reason: "user_not_found", supabaseUserId: sub },
        "[realtime] auth.rejected",
      );
      return next(new Error(SocketAuthErrorCode.UserNotInDb));
    }

    // Cast a `SocketData` (Socket.IO tipa `socket.data` como `Record<string, unknown>`).
    // `registerSocketAuth` garantiza estos campos; el contrato lo mantiene este archivo.
    (socket.data as Partial<SocketData>).supabaseUserId = sub;
    (socket.data as Partial<SocketData>).userId = user.id;
    deps.logger.info({ userId: user.id }, "[realtime] auth.success");
    next();
  });
}

function joseErrorReason(err: unknown): string {
  if (err && typeof err === "object" && "code" in err) {
    const code = (err as { code: unknown }).code;
    if (typeof code === "string") return code;
  }
  return "jose_verify_failed";
}
