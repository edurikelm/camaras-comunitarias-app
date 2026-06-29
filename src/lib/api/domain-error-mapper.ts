import { NextResponse } from "next/server";
import { appendFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

import { DomainError, type DomainErrorContext } from "@/domain/shared/domain-error";

export type { DomainErrorContext };

/**
 * Local-development error sink: writes unexpected (non-DomainError) exceptions
 * to a pre-approved temp file so they survive Turbopack's stdout silencing.
 *
 * In production this fallback is skipped — Vercel / hosting platform captures
 * stderr natively. The console.error call below is the canonical surface.
 */
const DEV_LOG_DIR = "C:\\Users\\eduri\\AppData\\Local\\Temp\\opencode";
const DEV_LOG_FILE = join(DEV_LOG_DIR, "next-api-errors.log");

function formatUnexpected(
  method: string,
  path: string,
  error: unknown,
): string {
  const timestamp = new Date().toISOString();
  const detail =
    error instanceof Error
      ? `${error.name}: ${error.message}\n${error.stack ?? ""}`
      : JSON.stringify(error, null, 2);
  return `[${timestamp}] [${method} ${path}] Unexpected error:\n${detail}`;
}

function writeDevLog(method: string, path: string, error: unknown): void {
  if (process.env.NODE_ENV === "production") return;
  try {
    mkdirSync(DEV_LOG_DIR, { recursive: true });
    appendFileSync(DEV_LOG_FILE, formatUnexpected(method, path, error) + "\n\n");
  } catch {
    // Filesystem fallback failed — stderr still gets the canonical log below.
  }
}

export function mapDomainErrorToResponse(
  error: unknown,
  context: DomainErrorContext,
): NextResponse {
  if (error instanceof DomainError) {
    const resp = error.httpResponse(context);
    resp.log?.();
    return NextResponse.json(resp.body, { status: resp.status });
  }
  console.error(
    `[${context.method} ${context.path}] Unexpected error:`,
    error,
  );
  writeDevLog(context.method, context.path, error);
  return NextResponse.json(
    { error: "Internal server error" },
    { status: 500 },
  );
}