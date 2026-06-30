// El cliente Prisma tipado vive en `src/generated/prisma/client.ts` del root.
// Importamos la clase para poder hacer `instanceof` y asercion de tipos en runtime.
// @ts-expect-error TS no resuelve .ts en imports cross-project
import { PrismaClient } from "../../../src/generated/prisma/client.ts";
import type { PrismaUserLookup } from "../auth/socket-auth.js";

export { type PrismaUserLookup } from "../auth/socket-auth.js";

/**
 * Factory que produce un PrismaUserLookup sobre un PrismaClient real.
 * Mirror del patron de `src/infrastructure/prisma/membership-lookups-adapter.ts`.
 *
 * IMPORTANTE: devuelve un object literal con metodos como OWN properties.
 * No usar una clase — los metodos de clase viven en el prototipo, y
 * `{...adapter}` en contextos que esperan un objeto plano los pierde silenciosamente.
 */
export function createPrismaUserLookup(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  client: any,
): PrismaUserLookup {
  return {
    async findUserByAuthProviderId(authProviderId) {
      return client.user.findUnique({
        where: { authProviderId },
        select: { id: true },
      });
    },
  };
}
