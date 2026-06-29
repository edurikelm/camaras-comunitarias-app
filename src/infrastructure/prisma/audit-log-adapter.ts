import { PrismaClient, type Prisma } from "@/generated/prisma/client";
import { AuditAction } from "@/generated/prisma/enums";
import {
  AuditLogError,
  type AuditLogEntry,
  type AuditLogPort,
} from "@/domain/shared/audit-log";

/**
 * A single line of defence: detect accidental misuse of top-level client
 * inside a transaction scope.  The adapter is meant to be created once per
 * transaction (via the factory below) so that audit writes always land in the
 * correct transaction boundary.
 *
 * We distinguish top-level vs transactional using `instanceof PrismaClient`.
 *
 * Why `instanceof` and not `"$transaction" in client`:
 *   Prisma 5.x's transaction proxy (the `tx` passed to
 *   `prisma.$transaction(async (tx) => ...)`) exposes `$transaction` on its
 *   prototype chain at runtime, even though the `TransactionClient` type
 *   derives from `Omit<PrismaClient, ITXClientDenyList>` and therefore
 *   declares `$transaction` as absent.  The `in` operator checks own +
 *   prototype properties, so it produced false positives for legitimate
 *   transactional scopes — every `createPrismaAuditLogAdapter(tx)` call
 *   inside an enclosing `prisma.$transaction` logged a spurious warning.
 *
 *   `instanceof PrismaClient` answers the actual question we care about
 *   ("is this the top-level client, not a tx proxy?") and does not depend
 *   on which methods Prisma happens to deny-list in any given version.
 */
function isTopLevelClient(
  client: PrismaClient | Prisma.TransactionClient,
): client is PrismaClient {
  return client instanceof PrismaClient;
}

/**
 * Creates an AuditLogPort backed by Prisma.
 *
 * The returned adapter works with both a top-level `PrismaClient` (for
 * single-query callers) and a `Prisma.TransactionClient` (for callers that
 * are already inside a `prisma.$transaction` block).  The distinction is
 * made by calling the factory with the appropriate client — callers are
 * responsible for using the right one.
 *
 * IMPORTANT: returns a plain object literal so that any caller that ever
 * spreads the result (e.g. `{...auditLog}`) keeps the `record` method as an
 * OWN property.  Wrapping it in a class would put `record` on the prototype
 * and silently drop it on spread.
 *
 * @example
 * // Top-level (direct writes, not in a transaction)
 * const adapter = createPrismaAuditLogAdapter(prisma);
 * await adapter.record({ ... });
 *
 * @example
 * // Inside an existing transaction — use the tx client
 * await prisma.$transaction(async (tx) => {
 *   const adapter = createPrismaAuditLogAdapter(tx);
 *   await adapter.record({ ... });
 * });
 */
export function createPrismaAuditLogAdapter(
  client: PrismaClient | Prisma.TransactionClient,
): AuditLogPort {
  if (isTopLevelClient(client)) {
    console.warn(
      "[PrismaAuditLogAdapter] Created with top-level PrismaClient. " +
        "Audit writes will NOT be part of any enclosing transaction. " +
        "Use the transaction client inside prisma.$transaction instead.",
    );
  }

  return {
    async record(input: AuditLogEntry): Promise<void> {
      try {
        await client.auditLog.create({
          data: {
            communityId: input.communityId,
            actorId: input.actorId,
            action: input.action as AuditAction,
            entityType: input.entityType,
            entityId: input.entityId,
            metadata: (input.metadata ?? {}) as Prisma.InputJsonValue,
          },
        });
      } catch (err) {
        throw new AuditLogError(
          `Failed to record audit log entry for "${input.action}" on ${input.entityType}:${input.entityId}`,
          err,
        );
      }
    },
  };
}