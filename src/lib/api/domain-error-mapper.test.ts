import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  CommunityAuthorizationError,
  CommunityInvariantError,
} from "@/domain/community/errors";
import {
  mapDomainErrorToResponse,
  DomainErrorContext,
} from "./domain-error-mapper";

// Note: EvidenceStorageError (502 + log) is exercised in
// src/domain/community/evidence/evidence-storage.test.ts via its httpResponse
// override, not here. The mapper test focuses on dispatch + fallback behavior.

describe("mapDomainErrorToResponse", () => {
  let context: DomainErrorContext;

  beforeEach(() => {
    context = { method: "GET", path: "/api/test/resource" };
    vi.spyOn(console, "error").mockClear();
  });

  it("returns 403 with error message for CommunityAuthorizationError", () => {
    const error = new CommunityAuthorizationError("Not authorized");
    const response = mapDomainErrorToResponse(error, context);

    expect(response.status).toBe(403);
    expect(response.headers.get("content-type")).toContain("application/json");
  });

  it("returns 400 with error message for CommunityInvariantError (not NotFound)", () => {
    const error = new CommunityInvariantError("User already in a community");
    const response = mapDomainErrorToResponse(error, context);

    expect(response.status).toBe(400);
    expect(response.headers.get("content-type")).toContain("application/json");
  });

  it("correctly serialises error message in JSON body", async () => {
    const error = new CommunityAuthorizationError("Custom auth message");
    const response = mapDomainErrorToResponse(error, context);
    const body = await response.json();

    expect(body).toEqual({ error: "Custom auth message" });
  });

  it("returns 500 with generic message for plain JavaScript Error", () => {
    const error = new Error("Something went wrong");
    const response = mapDomainErrorToResponse(error, context);

    expect(response.status).toBe(500);
    expect(response.headers.get("content-type")).toContain("application/json");
  });

  it("logs unexpected error to console.error with context prefix", () => {
    const error = new Error("Unexpected");
    const consoleErrorSpy = vi.spyOn(console, "error");

    mapDomainErrorToResponse(error, context);

    expect(consoleErrorSpy).toHaveBeenCalledOnce();
    const loggedMessage = consoleErrorSpy.mock.calls[0];
    expect(loggedMessage[0]).toBe(
      "[GET /api/test/resource] Unexpected error:",
    );
    expect(loggedMessage[1]).toBe(error);
  });

  it("returns 500 for string error", () => {
    const response = mapDomainErrorToResponse("string error" as unknown, context);
    expect(response.status).toBe(500);
  });

  it("returns 500 for null error", () => {
    const response = mapDomainErrorToResponse(null, context);
    expect(response.status).toBe(500);
  });

  it("returns 500 for undefined error", () => {
    const response = mapDomainErrorToResponse(undefined, context);
    expect(response.status).toBe(500);
  });

  it("returns 500 for plain object error", () => {
    const response = mapDomainErrorToResponse({ foo: "bar" } as unknown, context);
    expect(response.status).toBe(500);
  });

  it("uses method and path from context in log prefix", () => {
    const error = new Error("boom");
    const consoleErrorSpy = vi.spyOn(console, "error");
    const ctx = { method: "PATCH", path: "/api/cameras/[cameraId]/review" };

    mapDomainErrorToResponse(error, ctx);

    expect(consoleErrorSpy).toHaveBeenCalledOnce();
    expect(consoleErrorSpy.mock.calls[0][0]).toBe(
      "[PATCH /api/cameras/[cameraId]/review] Unexpected error:",
    );
  });
});