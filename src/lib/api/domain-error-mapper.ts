import { NextResponse } from "next/server";
import {
  CommunityAuthorizationError,
  CommunityInvariantError,
  CommunityNotFoundError,
} from "@/domain/community/errors";

export type DomainErrorContext = {
  method: string; // ej: "GET", "POST", "PATCH"
  path: string; // ej: "/api/cameras/[cameraId]/live"
};

export function mapDomainErrorToResponse(
  error: unknown,
  context: DomainErrorContext,
): NextResponse {
  if (error instanceof CommunityAuthorizationError) {
    return NextResponse.json({ error: error.message }, { status: 403 });
  }
  if (error instanceof CommunityNotFoundError) {
    return NextResponse.json({ error: error.message }, { status: 404 });
  }
  if (error instanceof CommunityInvariantError) {
    return NextResponse.json({ error: error.message }, { status: 400 });
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
