import Fastify from "fastify";
import cors from "@fastify/cors";
import { Server as SocketIOServer } from "socket.io";
import dotenv from "dotenv";
import { fileURLToPath } from "node:url";
import { PrismaPg } from "@prisma/adapter-pg";
// El cliente Prisma generado vive en `src/generated/prisma/client.ts` del root
// (custom output de prisma generate; ver prisma.config.ts). Importamos con
// extension .ts porque tsx (runtime de dev) lo resuelve; tsc marca error de
// "cannot find module" porque no soporta imports de .ts sin allowImportingTsExtensions.
// En produccion compilado a .js se ajustaria este path (o se usa un build step).
// @ts-expect-error TS no resuelve .ts en imports cross-project
import { PrismaClient } from "../../../src/generated/prisma/client.ts";
import { loadConfig, type Config } from "./config.js";
import { createLogger, type Logger } from "./logger.js";
import { registerHealthRoutes } from "./health.js";
import { createPrismaUserLookup } from "./infrastructure/prisma-user-lookup.js";
import { createPrismaMembershipLookupsAdapter } from "./infrastructure/prisma-membership-lookups.js";
import { registerSocketAuth } from "./auth/socket-auth.js";
import { bindConnectionHandlers } from "./connection/on-connection.js";
import { registerEmitHandler } from "./internal/emit-handler.js";

// Cargar variables de entorno desde .env antes que nada.
// Node NO carga .env automaticamente (eso lo hace Next.js via dotenv por nosotros).
// En produccion (NODE_ENV=production) no se carga .env — se espera que las variables
// esten provistas por el entorno (docker, k8s, systemd, etc.).
if (process.env.NODE_ENV !== "production") {
  dotenv.config();
}

export type Server = {
  start: () => Promise<void>;
  stop: () => Promise<void>;
  config: Config;
  logger: Logger;
};

export type CreateServerOptions = {
  config?: Config;
  logger?: Logger;
};

/**
 * Factory que crea una instancia del servidor Fastify + Socket.IO.
 * Devuelve { start, stop } para control de lifecycle (tests, graceful shutdown).
 *
 * El servidor monta:
 * - CORS para el handshake de Socket.IO
 * - Rutas de health check (/healthz, /readyz)
 * - Socket.IO (sin auth ni handlers en PR #0 — eso viene en PR #1 y PR #2)
 *
 * El cliente Prisma se importa desde `src/generated/prisma/client.ts` del root.
 * La extension .ts funciona con tsx (runtime de dev). En produccion compilado a
 * .js se ajustaria este path (o se usa un build step).
 */
export function createServer(options: CreateServerOptions = {}): Server {
  const config = options.config ?? loadConfig();
  const logger = options.logger ?? createLogger({ level: config.LOG_LEVEL, nodeEnv: config.NODE_ENV });

  const app = Fastify({
    logger: false, // usamos nuestro pino configurado
    disableRequestLogging: true,
  });

  // CORS para el handshake de Socket.IO
  app.register(cors, {
    origin: config.CORS_ORIGIN,
    credentials: true,
  });

  // Prisma client (Prisma 7.x usa driver adapters; ver src/lib/prisma.ts del root).
  // La conexion se configura via PrismaPg adapter con la DATABASE_URL.
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: config.DATABASE_URL }),
  });

  // Rutas de health check
  registerHealthRoutes(app, prisma);

  // Socket.IO (auth PR #1, handlers PR #2)
  const io = new SocketIOServer(app.server, {
    cors: { origin: config.CORS_ORIGIN, credentials: true },
  });

  // PR #1: autenticacion JWT en el handshake Socket.IO
  registerSocketAuth(io, {
    jwksUrl: `${config.SUPABASE_URL}/auth/v1/.well-known/jwks.json`,
    jwtAudience: config.SUPABASE_JWT_AUDIENCE,
    jwtIssuer: config.SUPABASE_URL,
    users: createPrismaUserLookup(prisma),
    logger,
  });

  // PR #2: rooms y autorizacion de suscripcion
  const lookups = createPrismaMembershipLookupsAdapter(prisma);
  bindConnectionHandlers(io, prisma, lookups, logger);

  // PR #3: handler de emision interna (POST /internal/emit)
  registerEmitHandler(app, io, config);

  let started = false;

  return {
    start: async () => {
      if (started) throw new Error("Server already started");
      started = true;
      await app.listen({ port: config.REALTIME_PORT, host: "0.0.0.0" });
      logger.info({ port: config.REALTIME_PORT }, "[realtime] server started");
    },
    stop: async () => {
      io.close();
      await app.close();
      await prisma.$disconnect();
      logger.info("[realtime] server stopped");
    },
    config,
    logger,
  };
}

// Entry point cuando se ejecuta directamente con `tsx src/server.ts`.
// Usamos `fileURLToPath` para normalizar el path de import.meta.url a la
// representacion nativa del OS antes de comparar (en Windows, import.meta.url
// usa `/` mientras que process.argv[1] usa `\`, por lo que una comparacion
// directa de strings siempre falla).
const isMainModule = process.argv[1] === fileURLToPath(import.meta.url);
if (isMainModule) {
  const server = createServer();
  server.start().catch((err) => {
    server.logger.fatal({ err }, "[realtime] failed to start");
    process.exit(1);
  });

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    server.logger.info({ signal }, "[realtime] shutdown signal received");
    await server.stop();
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}