import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  CommunityAuthorizationError,
  CommunityInvariantError,
  CommunityNotFoundError,
} from "@/domain/community/errors";
import { PlatformAuthorizationError, CommunityCreationInvariantError } from "@/domain/platform/create-community-with-first-admin";

describe("Community errors httpResponse", () => {
  const ctx = { method: "GET", path: "/api/test/resource" };

  describe("CommunityAuthorizationError", () => {
    it("returns 403 with message", () => {
      const error = new CommunityAuthorizationError("Not authorized");
      const resp = error.httpResponse(ctx);

      expect(resp.status).toBe(403);
      expect(resp.body).toEqual({ error: "Not authorized" });
    });

    it("has no log function", () => {
      const error = new CommunityAuthorizationError();
      const resp = error.httpResponse(ctx);

      expect(resp.log).toBeUndefined();
    });

    it("preserves name", () => {
      const error = new CommunityAuthorizationError();
      expect(error.name).toBe("CommunityAuthorizationError");
    });
  });

  describe("CommunityInvariantError", () => {
    it("returns 400 with message", () => {
      const error = new CommunityInvariantError("User already in a community");
      const resp = error.httpResponse(ctx);

      expect(resp.status).toBe(400);
      expect(resp.body).toEqual({ error: "User already in a community" });
    });

    it("has no log function", () => {
      const error = new CommunityInvariantError("test");
      const resp = error.httpResponse(ctx);

      expect(resp.log).toBeUndefined();
    });

    it("preserves name", () => {
      const error = new CommunityInvariantError("test");
      expect(error.name).toBe("CommunityInvariantError");
    });
  });

  describe("CommunityNotFoundError", () => {
    it("returns 404 (NOT 400 inherited from parent)", () => {
      const error = new CommunityNotFoundError("Camera not found");
      const resp = error.httpResponse(ctx);

      expect(resp.status).toBe(404);
      expect(resp.body).toEqual({ error: "Camera not found" });
    });

    it("preserves name", () => {
      const error = new CommunityNotFoundError("test");
      expect(error.name).toBe("CommunityNotFoundError");
    });
  });

  describe("PlatformAuthorizationError (via inheritance)", () => {
    it("returns 403 via parent class inheritance", () => {
      const error = new PlatformAuthorizationError();
      const resp = error.httpResponse(ctx);

      expect(resp.status).toBe(403);
      expect(resp.body).toEqual({ error: "Only PLATFORM_ADMIN can create communities" });
    });

    it("preserves name", () => {
      const error = new PlatformAuthorizationError();
      expect(error.name).toBe("PlatformAuthorizationError");
    });
  });

  describe("CommunityCreationInvariantError (via inheritance)", () => {
    it("returns 400 via parent class inheritance", () => {
      const error = new CommunityCreationInvariantError("Actor id is required");
      const resp = error.httpResponse(ctx);

      expect(resp.status).toBe(400);
      expect(resp.body).toEqual({ error: "Actor id is required" });
    });

    it("preserves name", () => {
      const error = new CommunityCreationInvariantError("test");
      expect(error.name).toBe("CommunityCreationInvariantError");
    });
  });
});