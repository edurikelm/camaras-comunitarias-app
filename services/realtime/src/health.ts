import type { FastifyInstance } from "fastify";

/**
 * Registra las rutas de health check del servicio.
 *
 * GET /healthz — siempre retorna 200 si el proceso esta vivo.
 * GET /readyz — verifica conectividad a la base de datos con SELECT 1.
 */
export function registerHealthRoutes(
  app: FastifyInstance,
  prisma: { $queryRaw: (strings: TemplateStringsArray, ...args: unknown[]) => Promise<unknown> }
): void {
  app.get("/healthz", async () => {
    return { status: "ok" };
  });

  app.get("/readyz", async (_req, reply) => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      return { status: "ready" };
    } catch (err) {
      app.log.error({ err }, "[realtime] readyz failed");
      return reply.status(503).send({ status: "not_ready", error: String(err) });
    }
  });
}
