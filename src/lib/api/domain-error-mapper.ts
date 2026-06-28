import { NextResponse } from "next/server";
import { DomainError, type DomainErrorContext } from "@/domain/shared/domain-error";

export type { DomainErrorContext };

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
  return NextResponse.json(
    { error: "Internal server error" },
    { status: 500 },
  );
}