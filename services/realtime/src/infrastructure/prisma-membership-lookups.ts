// El cliente Prisma tipado vive en `src/generated/prisma/client.ts` del root.
// Importamos la clase para poder hacer `instanceof` y asercion de tipos en runtime.
// @ts-expect-error TS2307 — el path resuelve via tsconfig paths pero la extension .ts genera error de "cannot find module"
import { PrismaClient, type Prisma } from "../../../src/generated/prisma/client.ts";
// @ts-ignore TS6059 — el path resolve via tsconfig paths (paths lo hace innecesario), se deja para documentar el cross-project
import type { MembershipLookupsPort } from "../../../../src/domain/community/membership/membership-lookups";

/**
 * Factory que produce un MembershipLookupsPort sobre un PrismaClient real.
 *
 * NOTA sobre divergencia con el root adapter: este mirror incluye `sectorId: true`
 * en los select de findActiveMember, findActiveAdminMember, etc. La divergencia
 * es INTENCIONAL y NECESARIA: joinAuthorizedRoom usa `m.sectorId` para validar
 * suscripciones a sector rooms (ver ADR-0017 seccion e). El root adapter no lo
 * necesita porque ninguna policy de dominio consume sectorId desde
 * MemberLookupRecord.
 *
 * Si en el futuro una policy del root lo necesita, agregar sectorId al root
 * adapter para mantener consistencia.
 *
 * IMPORTANTE: devuelve un object literal con metodos como OWN properties.
 * No usar una clase — los metodos de clase viven en el prototipo, y
 * `{...adapter}` en contextos que esperan un objeto plano los pierde silenciosamente.
 * Ver commits 9e1a2ff y 10cc8a1.
 */
export function createPrismaMembershipLookupsAdapter(
  client: PrismaClient | Prisma.TransactionClient,
): MembershipLookupsPort {
  return {
    async findCommunityById(id) {
      return client.community.findUnique({
        where: { id },
        select: { id: true, name: true, status: true },
      });
    },

    async findActiveAdminMember(communityId, userId) {
      return client.communityMember.findFirst({
        where: { userId, communityId, role: "ADMIN", status: "ACTIVE" },
        select: {
          id: true,
          userId: true,
          communityId: true,
          sectorId: true,
          role: true,
          status: true,
        },
      });
    },

    async findActiveNeighborOrGuardMember(communityId, userId) {
      return client.communityMember.findFirst({
        where: {
          userId,
          communityId,
          status: "ACTIVE",
          role: { in: ["NEIGHBOR", "GUARD"] },
        },
        select: {
          id: true,
          userId: true,
          communityId: true,
          sectorId: true,
          role: true,
          status: true,
        },
      });
    },

    async findActiveMember(communityId, userId) {
      return client.communityMember.findFirst({
        where: { userId, communityId, status: "ACTIVE" },
        select: {
          id: true,
          userId: true,
          communityId: true,
          sectorId: true,
          role: true,
          status: true,
        },
      });
    },

    async findActiveAdminOrGuardMember(communityId, userId) {
      return client.communityMember.findFirst({
        where: {
          userId,
          communityId,
          status: "ACTIVE",
          role: { in: ["ADMIN", "GUARD"] },
        },
        select: {
          id: true,
          userId: true,
          communityId: true,
          sectorId: true,
          role: true,
          status: true,
        },
      });
    },

    async findSectorById(sectorId) {
      return client.communitySector.findUnique({
        where: { id: sectorId },
        select: { id: true, communityId: true, name: true },
      });
    },
  };
}
