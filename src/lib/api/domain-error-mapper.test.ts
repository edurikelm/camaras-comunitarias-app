import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  CommunityAuthorizationError,
  CommunityInvariantError,
  CommunityNotFoundError,
} from "@/domain/community/errors";
import { EvidenceStorageError } from "@/domain/community/evidence/evidence-storage";
import {
  mapDomainErrorToResponse,
  DomainErrorContext,
} from "./domain-error-mapper";

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

  it("returns 404 with error message for CommunityNotFoundError", () => {
    const error = new CommunityNotFoundError("Community not found");
    const response = mapDomainErrorToResponse(error, context);

    expect(response.status).toBe(404);
    expect(response.headers.get("content-type")).toContain("application/json");
  });

  it("CommunityNotFoundError is an instance of CommunityInvariantError", () => {
    const error = new CommunityNotFoundError("Camera not found");
    expect(error instanceof CommunityInvariantError).toBe(true);
    expect(error instanceof CommunityNotFoundError).toBe(true);
  });

  it("returns 502 for EvidenceStorageError with storage failure message", () => {
    const error = new EvidenceStorageError(
      "Failed to upload file",
      new Error("Bucket not found"),
    );
    const consoleErrorSpy = vi.spyOn(console, "error");
    const response = mapDomainErrorToResponse(error, context);

    expect(response.status).toBe(502);
    expect(response.headers.get("content-type")).toContain("application/json");
    expect(consoleErrorSpy).toHaveBeenCalledOnce();
    const loggedMessage = consoleErrorSpy.mock.calls[0];
    expect(loggedMessage[0]).toBe(
      "[GET /api/test/resource] Evidence storage failure:",
    );
    expect(loggedMessage[1]).toBe(error.cause);
  });

  it("EvidenceStorageError does NOT fall through to CommunityInvariantError branch", () => {
    // EvidenceStorageError extends CommunityInvariantError for back-compat,
    // but the mapper must catch it BEFORE the general CommunityInvariantError branch.
    const error = new EvidenceStorageError("Storage failed");
    const consoleErrorSpy = vi.spyOn(console, "error").mockClear();
    const response = mapDomainErrorToResponse(error, context);

    // Must be 502, not 400 (which would happen if it fell through to InvariantError)
    expect(response.status).toBe(502);
    expect(consoleErrorSpy).toHaveBeenCalledOnce(); // logs the cause
  });

  it("returns 400 with error message for CommunityInvariantError (not NotFound)", () => {
    const error = new CommunityInvariantError("User already in a community");
    const response = mapDomainErrorToResponse(error, context);

    expect(response.status).toBe(400);
    expect(response.headers.get("content-type")).toContain("application/json");
  });

  it("returns 500 with generic message for plain JavaScript Error", () => {
    const error = new Error("Something went wrong");
    const response = mapDomainErrorToResponse(error, context);

    expect(response.status).toBe(500);
    expect(response.headers.get("content-type")).toContain("application/json");
  });

  it("logs unexpected error to console.error with context prefix", async () => {
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

  it("correctly serialises error message in JSON body", async () => {
    const error = new CommunityAuthorizationError("Custom auth message");
    const response = mapDomainErrorToResponse(error, context);
    const body = await response.json();

    expect(body).toEqual({ error: "Custom auth message" });
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
