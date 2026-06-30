/**
 * Handler de conexion de Socket.IO.
 *
 * Se ejecuta automaticamente cuando un cliente se conecta (post-auth gracias al
 * middleware de PR #1). Une al usuario a las rooms que le corresponden segun
 * sus membresias ACTIVE en la base de datos.
 *
 * Server-side authority: NO expone socket.join al cliente. El cliente no puede
 * pedir unirse a una room que no le corresponde.
 *
 * Basado en ADR-0017 PR #2 seccion (e).
 */
import type { Server } from "socket.io";
// @ts-expect-error TS2307 — el path resuelve via tsconfig paths pero la extension .ts genera error de "cannot find module"
import type { PrismaClient } from "../../../src/generated/prisma/client.ts";
// @ts-ignore TS6059 — el path resolve via tsconfig paths (paths lo hace innecesario), se deja para documentar el cross-project
import type { MembershipLookupsPort } from "../../../../src/domain/community/membership/membership-lookups";
import type { Logger } from "../logger.js";
import { joinAuthorizedRoom } from "../rooms/join-authorized-room.js";
// @ts-ignore TS6059 — el path resolve via tsconfig paths (paths lo hace innecesario), se deja para documentar el cross-project
import { userRoom } from "../../../../packages/shared/src/realtime/rooms";

export function bindConnectionHandlers(
  io: Server,
  prisma: PrismaClient,
  lookups: MembershipLookupsPort,
  logger: Logger,
): void {
  io.on("connection", async (socket) => {
    const userId = socket.data.userId as string | undefined;
    if (!userId) {
      // El middleware de auth deberia haber poblado esto. Defense in depth.
      logger.warn({ socketId: socket.id }, "[realtime] connection rejected: no userId");
      socket.disconnect(true);
      return;
    }

    try {
      // 1. Siempre unir al user a su DM room (aunque no tenga membresias activas)
      await socket.join(userRoom(userId));

      // 2. Listar membresias ACTIVE del usuario y unir a las rooms correspondientes
      const memberships = await prisma.communityMember.findMany({
        where: { userId, status: "ACTIVE", deletedAt: null },
        select: { communityId: true, sectorId: true, role: true },
      });

      for (const m of memberships) {
        const communityResult = await joinAuthorizedRoom(socket, lookups, {
          kind: "community",
          communityId: m.communityId,
        });
        if (communityResult.joined) {
          logger.debug(
            { userId, communityId: m.communityId, room: communityResult.room },
            "[realtime] connection.joined",
          );
        }

        if (m.sectorId) {
          await joinAuthorizedRoom(socket, lookups, {
            kind: "sector",
            communityId: m.communityId,
            sectorId: m.sectorId,
          });
        }

        if (m.role === "ADMIN" || m.role === "GUARD") {
          await joinAuthorizedRoom(socket, lookups, {
            kind: "roleAdminGuard",
            communityId: m.communityId,
          });
        }
      }

      logger.info(
        { userId, communitiesCount: memberships.length },
        "[realtime] connection.established",
      );

      socket.on("disconnect", (reason) => {
        logger.info({ userId, reason }, "[realtime] connection.closed");
      });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      logger.error(
        { reason: "connection_handler_failed", userId, errorMessage },
        "[realtime] connection.error",
      );
      socket.disconnect(true);
    }
  });
}
