import type { Prisma, PrismaClient } from "@/generated/prisma/client";
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
 * We distinguish top-level vs transactional by checking for the presence of
 * `$transaction` — a method that only exists on `PrismaClient`, never on
 * `Prisma.TransactionClient`.
 */
function isTopLevelClient(
  client: PrismaClient | Prisma.TransactionClient,
): client is PrismaClient {
  return "$transaction" in client;
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
  return new PrismaAuditLogAdapter(client);
}

class PrismaAuditLogAdapter implements AuditLogPort {
  constructor(
    private readonly client: PrismaClient | Prisma.TransactionClient,
  ) {
    if (isTopLevelClient(client)) {
      console.warn(
        "[PrismaAuditLogAdapter] Created with top-level PrismaClient. " +
          "Audit writes will NOT be part of any enclosing transaction. " +
          "Use the transaction client inside prisma.$transaction instead.",
      );
    }
  }

  async record(input: AuditLogEntry): Promise<void> {
    try {
      await this.client.auditLog.create({
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
  }
}
