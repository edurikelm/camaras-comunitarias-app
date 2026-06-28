import { describe, it, expect, vi, beforeEach } from "vitest";
import { EvidenceStorageError } from "@/domain/community/evidence/evidence-storage";
import { CommunityInvariantError } from "@/domain/community/errors";

describe("EvidenceStorageError", () => {
  const ctx = { method: "POST", path: "/api/evidence/upload" };

  beforeEach(() => {
    vi.spyOn(console, "error").mockClear();
  });

  it("returns 502 with fixed body message", () => {
    const error = new EvidenceStorageError("Failed to upload file");
    const resp = error.httpResponse(ctx);

    expect(resp.status).toBe(502);
    expect(resp.body).toEqual({ error: "Evidence storage temporarily unavailable" });
  });

  it("body does NOT contain the error message (fixed message)", () => {
    const error = new EvidenceStorageError("Failed to upload file");
    const resp = error.httpResponse(ctx);

    expect(resp.body.error).not.toBe("Failed to upload file");
    expect(resp.body.error).toBe("Evidence storage temporarily unavailable");
  });

  it("has a log function", () => {
    const error = new EvidenceStorageError("Failed");
    const resp = error.httpResponse(ctx);

    expect(typeof resp.log).toBe("function");
  });

  it("log prints prefix and cause when log is invoked", () => {
    const cause = new Error("Bucket not found");
    const error = new EvidenceStorageError("Failed to upload", cause);
    const consoleErrorSpy = vi.spyOn(console, "error").mockClear();

    const resp = error.httpResponse(ctx);
    resp.log?.();

    expect(consoleErrorSpy).toHaveBeenCalledOnce();
    const loggedMessage = consoleErrorSpy.mock.calls[0];
    expect(loggedMessage[0]).toBe(
      "[POST /api/evidence/upload] Evidence storage failure:",
    );
    expect(loggedMessage[1]).toBe(cause);
  });

  it("log uses error itself as fallback when cause is undefined", () => {
    const error = new EvidenceStorageError("Failed to upload");
    const consoleErrorSpy = vi.spyOn(console, "error").mockClear();

    const resp = error.httpResponse(ctx);
    resp.log?.();

    expect(consoleErrorSpy).toHaveBeenCalledOnce();
    const loggedMessage = consoleErrorSpy.mock.calls[0];
    expect(loggedMessage[0]).toBe(
      "[POST /api/evidence/upload] Evidence storage failure:",
    );
    expect(loggedMessage[1]).toBe(error);
  });

  it("is still an instance of CommunityInvariantError (back-compat)", () => {
    const error = new EvidenceStorageError("Failed");
    expect(error instanceof CommunityInvariantError).toBe(true);
  });

  it("preserves name", () => {
    const error = new EvidenceStorageError("test");
    expect(error.name).toBe("EvidenceStorageError");
  });
});