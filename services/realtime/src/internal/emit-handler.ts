/**
 * Handler para el endpoint interno POST /internal/emit.
 * Recibe eventos del dominio (Next.js) y los re-emite via Socket.IO.
 *
 * Validado con X-Internal-Secret. Emite a las rooms del audience.
 */

import type { FastifyInstance } from "fastify";
import type { Server } from "socket.io";
import { z } from "zod";
import type { Config } from "../config.js";

// ---------------------------------------------------------------------------
// Body schemas inline (evita incompatibilidad de versiones Zod entre packages)
// ---------------------------------------------------------------------------

const AlertPayloadSchema = z.object({
  alertId: z.string().uuid(),
  communityId: z.string().uuid(),
  sectorId: z.string().uuid().nullable(),
  severity: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]),
  type: z.string(),
  message: z.string(),
  incidentId: z.string().uuid().nullable(),
  sosEventId: z.string().uuid().nullable(),
  createdAt: z.string().datetime(),
});

const IncidentPayloadSchema = z.object({
  incidentId: z.string().uuid(),
  communityId: z.string().uuid(),
  sectorId: z.string().uuid().nullable(),
  type: z.enum([
    "THEFT",
    "SUSPICIOUS_PERSON",
    "SUSPICIOUS_VEHICLE",
    "EMERGENCY",
    "ACCIDENT",
    "OTHER",
  ]),
  severity: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]),
  status: z.enum(["OPEN", "REVIEWING", "CLOSED"]),
  description: z.string(),
  location: z.string().nullable(),
  createdById: z.string().uuid(),
  createdAt: z.string().datetime(),
});

const EmitBodySchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("alert.created"),
    communityId: z.string(),
    audience: z.object({
      roomKeys: z.array(z.string()),
      userIds: z.array(z.string()),
    }),
    payload: AlertPayloadSchema,
  }),
  z.object({
    type: z.literal("incident.created"),
    communityId: z.string(),
    audience: z.object({
      roomKeys: z.array(z.string()),
      userIds: z.array(z.string()),
    }),
    payload: IncidentPayloadSchema,
  }),
]);

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

export function registerEmitHandler(
  app: FastifyInstance,
  io: Server,
  config: Config,
): void {
  app.post("/internal/emit", async (req, reply) => {
    // Validar header de secreto interno
    const secret = req.headers["x-internal-secret"] as string | undefined;
    if (!secret || secret !== config.REALTIME_INTERNAL_SECRET) {
      return reply.status(401).send({ error: "Unauthorized" });
    }

    // Parsear y validar body con Zod
    const parseResult = EmitBodySchema.safeParse(req.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        error: "Invalid payload",
        details: parseResult.error.flatten(),
      });
    }

    const { type, audience, payload } = parseResult.data;

    // Log receive
    req.log.info(
      { type, audienceSize: audience.roomKeys.length, roomKeys: audience.roomKeys },
      "emit.received",
    );

    // Emitir a cada room del audience
    for (const roomKey of audience.roomKeys) {
      io.to(roomKey).emit(type, payload);
    }

    // Calcular total de sockets en las rooms destino
    const adapter = io.sockets.adapter;
    const recipientCount = audience.roomKeys.reduce<number>((sum, roomKey) => {
      return sum + (adapter.rooms.get(roomKey)?.size ?? 0);
    }, 0);

    // Log emit
    req.log.info({ type, recipients: recipientCount }, "emit.emitted");

    return reply.status(200).send({ ok: true, emitted: audience.roomKeys });
  });
}
