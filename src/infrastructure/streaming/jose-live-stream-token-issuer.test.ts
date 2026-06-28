import { describe, expect, it } from "vitest";
import { JoseLiveStreamTokenIssuer } from "./jose-live-stream-token-issuer";
import { jwtVerify, SignJWT } from "jose";

describe("JoseLiveStreamTokenIssuer", () => {
  const SECRET = "test-stream-secret-at-least-32-chars!!";
  const MEDIA_URL = "https://media.example.com";

  function createIssuer(
    secret: string = SECRET,
    mediaUrl: string = MEDIA_URL,
  ): JoseLiveStreamTokenIssuer {
    return new JoseLiveStreamTokenIssuer({
      streamSecret: secret,
      mediaServerUrl: mediaUrl,
    });
  }

  describe("issue()", () => {
    it("returns expiresAt that matches the input", async () => {
      const issuer = createIssuer();
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

      const result = await issuer.issue({
        cameraId: "cam-1",
        userId: "user-1",
        expiresAt,
      });

      expect(result.expiresAt).toBe(expiresAt);
    });

    it("returns streamUrl with the configured mediaServerUrl", async () => {
      const issuer = createIssuer();

      const result = await issuer.issue({
        cameraId: "cam-xyz",
        userId: "user-abc",
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      });

      expect(result.streamUrl).toContain("https://media.example.com/stream/cam-xyz?token=");
      expect(result.streamUrl).toContain("cam-xyz");
      expect(result.streamUrl).toMatch(/^https:\/\/media\.example\.com\/stream\/cam-xyz\?token=/);
    });

    it("produces a JWT signed with HS256 that is verifiable with the same secret", async () => {
      const issuer = createIssuer();
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

      const { token } = await issuer.issue({
        cameraId: "cam-1",
        userId: "user-1",
        expiresAt,
      });

      const verified = await jwtVerify(token, new TextEncoder().encode(SECRET));
      expect(verified.payload).toMatchObject({
        cameraId: "cam-1",
        userId: "user-1",
      });
    });

    it("JWT header contains alg: HS256", async () => {
      const issuer = createIssuer();

      const { token } = await issuer.issue({
        cameraId: "cam-1",
        userId: "user-1",
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      });

      // Decode JWT header (second part, base64url)
      const header = JSON.parse(
        Buffer.from(token.split(".")[0], "base64url").toString("utf-8"),
      );
      expect(header.alg).toBe("HS256");
    });

    it("constructor with empty streamSecret throws descriptive error", () => {
      // jose rejects zero-length keys; we catch it early with a clear message.
      expect(
        () =>
          new JoseLiveStreamTokenIssuer({
            streamSecret: "",
            mediaServerUrl: MEDIA_URL,
          }),
      ).toThrow("streamSecret is required");
    });
  });
});
