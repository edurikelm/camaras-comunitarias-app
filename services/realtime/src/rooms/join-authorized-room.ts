/**
 * Helper de autorizacion de rooms para Socket.IO.
 *
 * Server-side authority: el cliente NUNCA elige rooms. Este helper valida
 * que el usuario tiene derecho a la room pedida y la une si corresponde.
 *
 * Basado en ADR-0017 PR #2 seccion (e).
 */
import type { Socket } from "socket.io";
// @ts-ignore TS6059 — el path resolve via tsconfig paths (paths lo hace innecesario), se deja para documentar el cross-project
import type { MembershipLookupsPort } from "../../../../src/domain/community/membership/membership-lookups";
// @ts-ignore TS6059 — el path resolve via tsconfig paths (paths lo hace innecesario), se deja para documentar el cross-project
import { communityRoom, sectorRoom, userRoom, roleAdminGuardRoom } from "../../../../packages/shared/src/realtime/rooms";

export type JoinRoomInput =
  | { kind: "community"; communityId: string }
  | { kind: "sector"; communityId: string; sectorId: string }
  | { kind: "user"; userId: string }
  | { kind: "roleAdminGuard"; communityId: string };

export type JoinRoomResult =
  | { joined: true; room: string }
  | { joined: false; reason: string };

/**
 * Valida y une al socket a una room si el usuario tiene autorizacion.
 *
 * - "community": requiere membresia ACTIVE en la comunidad.
 * - "sector": requiere membresia ACTIVE Y que sectorId del miembro coincida.
 * - "user": requiere que input.userId === socket.data.userId (solo se une a su propia DM room).
 * - "roleAdminGuard": requiere membresia ACTIVE con rol ADMIN o GUARD.
 */
export async function joinAuthorizedRoom(
  socket: Socket,
  lookups: MembershipLookupsPort,
  input: JoinRoomInput,
): Promise<JoinRoomResult> {
  const userId = socket.data.userId as string;
  if (!userId) return { joined: false, reason: "no_user_in_socket_data" };

  switch (input.kind) {
    case "community": {
      const m = await lookups.findActiveMember(input.communityId, userId);
      if (!m) return { joined: false, reason: "not_member" };
      const room = communityRoom(input.communityId);
      await socket.join(room);
      return { joined: true, room };
    }
    case "sector": {
      const m = await lookups.findActiveMember(input.communityId, userId);
      if (!m || m.sectorId !== input.sectorId) {
        return { joined: false, reason: "not_in_sector" };
      }
      const room = sectorRoom(input.sectorId);
      await socket.join(room);
      return { joined: true, room };
    }
    case "user": {
      if (input.userId !== userId) return { joined: false, reason: "not_owner" };
      const room = userRoom(userId);
      await socket.join(room);
      return { joined: true, room };
    }
    case "roleAdminGuard": {
      const m = await lookups.findActiveAdminOrGuardMember(input.communityId, userId);
      if (!m) return { joined: false, reason: "not_admin_or_guard" };
      const room = roleAdminGuardRoom(input.communityId);
      await socket.join(room);
      return { joined: true, room };
    }
  }
}
