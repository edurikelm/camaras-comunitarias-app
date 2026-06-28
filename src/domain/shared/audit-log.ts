import { DomainError, type DomainErrorContext, type DomainErrorResponse } from "@/domain/shared/domain-error";

/**
 * Represents a single audit log entry to be recorded.
 */
export type AuditLogEntry = {
  communityId: string;
  actorId: string;
  action: string;
  entityType: string;
  entityId: string;
  metadata?: Record<string, unknown>;
};

/**
 * Port for recording audit log entries.
 *
 * Implemented by infrastructure adapters (e.g. Prisma) and injected into
 * repository factories so domain services can call `tx.auditLog.record(...)`
 * inside transactions without coupling to a specific persistence technology.
 */
export interface AuditLogPort {
  record(input: AuditLogEntry): Promise<void>;
}

/**
 * Error thrown when the audit log persistence layer fails.
 *
 * Extends DomainError so the DomainErrorMapper can branch on it,
 * mapping to 500 Internal Server Error (audit failures are unexpected
 * infrastructure errors, not domain invariants or authorization issues).
 */
export class AuditLogError extends DomainError {
  constructor(
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = "AuditLogError";
  }

  httpResponse(_ctx: DomainErrorContext): DomainErrorResponse {
    return {
      status: 500,
      body: { error: "Audit log unavailable" },
      log: () =>
        console.error(
          `[${_ctx.method} ${_ctx.path}] Audit log failure:`,
          this.cause ?? this,
        ),
    };
  }
}
