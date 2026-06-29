import Fastify from "fastify";
import cors from "@fastify/cors";
import { Server as SocketIOServer } from "socket.io";
import { loadConfig, type Config } from "./config.js";
import { createLogger, type Logger } from "./logger.js";
import { registerHealthRoutes } from "./health.js";

// PrismaClient se importa via require() dinamico para evitar problemas de
// resolucion de modulos con paths que cruzan directorios (el cliente
// generado vive en el root src/generated/prisma/).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type PrismaLike = { $queryRaw: (strings: TemplateStringsArray, ...args: unknown[]) => Promise<unknown>; $disconnect: () => Promise<void> };
type PrismaClientConstructor = new (opts: { datasources: { db: { url: string } } }) => PrismaLike;

function createPrismaClient(url: string, PrismaClient: PrismaClientConstructor): PrismaLike {
  return new PrismaClient({ datasources: { db: { url } } });
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

  // Prisma client — se crea lazy para permitir tests sin DB real
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { PrismaClient } = require("../../src/generated/prisma/client.js") as { PrismaClient: PrismaClientConstructor };
  const prisma = createPrismaClient(config.DATABASE_URL, PrismaClient);

  // Rutas de health check
  registerHealthRoutes(app, prisma);

  // Socket.IO (sin auth ni handlers — PR #1 y PR #2)
  const io = new SocketIOServer(app.server, {
    cors: { origin: config.CORS_ORIGIN, credentials: true },
  });

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

// Entry point cuando se ejecuta directamente con `tsx src/server.ts`
const isMainModule = import.meta.url === `file://${process.argv[1]}`;
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
