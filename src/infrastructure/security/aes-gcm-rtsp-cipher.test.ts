import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createDecipheriv, randomBytes, createHash } from "node:crypto";
import { AesGcmRtspCipherAdapter, createRtspCipherFromEnv } from "./aes-gcm-rtsp-cipher";
import { RtspCipherError } from "@/domain/community/camera/rtsp-cipher";

const TEST_SECRET = "test-camera-rtsp-secret-2024";
const AES_ALGORITHM = "aes-256-gcm";

function decryptWithAesGcm(encrypted: string, secret: string): string {
  const [ivHex, authTagHex, ciphertextHex] = encrypted.split(":");
  const key = createHash("sha256").update(secret).digest();
  const iv = Buffer.from(ivHex, "hex");
  const authTag = Buffer.from(authTagHex, "hex");
  const decipher = createDecipheriv(AES_ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  const decrypted = Buffer.concat([
    decipher.update(ciphertextHex, "hex"),
    decipher.final(),
  ]);
  return decrypted.toString("utf8");
}

describe("AesGcmRtspCipherAdapter", () => {
  let adapter: AesGcmRtspCipherAdapter;

  beforeEach(() => {
    adapter = new AesGcmRtspCipherAdapter(TEST_SECRET);
  });

  describe("encryptRtspUrl", () => {
    it("returns format iv:authTag:ciphertext in hex", () => {
      const result = adapter.encryptRtspUrl("rtsp://192.168.1.100:554/stream");

      const parts = result.split(":");
      expect(parts).toHaveLength(3);
      const [ivHex, authTagHex, ciphertextHex] = parts;

      // IV: randomBytes(16) = 16 bytes = 32 hex chars
      expect(ivHex).toHaveLength(32);
      expect(ivHex).toMatch(/^[0-9a-f]{32}$/);

      // AuthTag: getAuthTag() = 16 bytes = 32 hex chars
      expect(authTagHex).toHaveLength(32);
      expect(authTagHex).toMatch(/^[0-9a-f]{32}$/);

      // Ciphertext: variable length, depends on input
      expect(ciphertextHex).toMatch(/^[0-9a-f]+$/);
    });

    it("can decrypt what it encrypts", () => {
      const plaintext = "rtsp://test.camera.local:8554/live";
      const encrypted = adapter.encryptRtspUrl(plaintext);
      const decrypted = decryptWithAesGcm(encrypted, TEST_SECRET);

      expect(decrypted).toBe(plaintext);
    });

    it("produces different IVs for same input (random IV)", () => {
      const plaintext = "rtsp://same.camera.local:554/stream";

      const result1 = adapter.encryptRtspUrl(plaintext);
      const result2 = adapter.encryptRtspUrl(plaintext);

      expect(result1).not.toBe(result2);

      // But both should decrypt to the same plaintext
      const decrypted1 = decryptWithAesGcm(result1, TEST_SECRET);
      const decrypted2 = decryptWithAesGcm(result2, TEST_SECRET);
      expect(decrypted1).toBe(plaintext);
      expect(decrypted2).toBe(plaintext);
    });

    it("uses aes-256-gcm with SHA-256 derived key", () => {
      const plaintext = "rtsp://verify-algorithm.local/stream";
      const encrypted = adapter.encryptRtspUrl(plaintext);

      // Verify we can decrypt it (proves correct algorithm and key derivation)
      const decrypted = decryptWithAesGcm(encrypted, TEST_SECRET);
      expect(decrypted).toBe(plaintext);

      // Verify tampering detection: change one char in ciphertext
      const [ivHex, authTagHex, ciphertextHex] = encrypted.split(":");
      const tamperedCiphertext = ciphertextHex.replace(/^./, "Z");
      const tamperedEncrypted = `${ivHex}:${authTagHex}:${tamperedCiphertext}`;

      expect(() => {
        decryptWithAesGcm(tamperedEncrypted, TEST_SECRET);
      }).toThrow();
    });
  });

  describe("hashStreamKey", () => {
    it("returns SHA-256 hex digest (64 hex chars)", () => {
      const result = adapter.hashStreamKey("my-stream-key-123");

      expect(result).toMatch(/^[0-9a-f]{64}$/);
      expect(result).toHaveLength(64);
    });

    it("returns deterministic hash for same input", () => {
      const key = "test-stream-key";
      const result1 = adapter.hashStreamKey(key);
      const result2 = adapter.hashStreamKey(key);

      expect(result1).toBe(result2);
    });

    it("returns different hash for different inputs", () => {
      const result1 = adapter.hashStreamKey("key-one");
      const result2 = adapter.hashStreamKey("key-two");

      expect(result1).not.toBe(result2);
    });

    it("matches raw node:crypto SHA-256 output", () => {
      const key = "verify-sha256-key";
      const expected = createHash("sha256").update(key).digest("hex");

      const result = adapter.hashStreamKey(key);

      expect(result).toBe(expected);
    });
  });
});

describe("createRtspCipherFromEnv", () => {
  const originalEnv = process.env.CAMERA_RTSP_SECRET;

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env.CAMERA_RTSP_SECRET = originalEnv;
    } else {
      delete process.env.CAMERA_RTSP_SECRET;
    }
  });

  it("returns an adapter when CAMERA_RTSP_SECRET is set", () => {
    process.env.CAMERA_RTSP_SECRET = "my-secret-key";

    const cipher = createRtspCipherFromEnv();

    expect(cipher).toBeInstanceOf(AesGcmRtspCipherAdapter);
    const encrypted = cipher.encryptRtspUrl("rtsp://test.local/stream");
    expect(encrypted).toMatch(/^[0-9a-f:]+$/);
  });

  it("throws RtspCipherError when CAMERA_RTSP_SECRET is not set", () => {
    delete process.env.CAMERA_RTSP_SECRET;

    expect(() => createRtspCipherFromEnv()).toThrow(RtspCipherError);
  });

  it("throws RtspCipherError (not generic Error) when secret is missing", () => {
    delete process.env.CAMERA_RTSP_SECRET;

    try {
      createRtspCipherFromEnv();
      expect.fail("Should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(RtspCipherError);
      expect((err as RtspCipherError).message).toContain("CAMERA_RTSP_SECRET");
    }
  });
});

describe("bit-exactness: legacy format compatibility", () => {
  // These tests verify the new adapter produces output compatible with
  // the original encryptRTSP helper from camera-repository.ts
  // (ADR-0003 contract: iv:authTag:ciphertext in hex, AES-256-GCM, SHA-256 key)

  it("adapter output is descryptable with the same secret", () => {
    const secret = "bit-exactness-test-secret";
    const adapter = new AesGcmRtspCipherAdapter(secret);
    const plaintext = "rtsp://192.168.1.50:554/h264/ch1/main/av_stream";

    const encrypted = adapter.encryptRtspUrl(plaintext);
    const decrypted = decryptWithAesGcm(encrypted, secret);

    expect(decrypted).toBe(plaintext);
  });

  it("hashStreamKey matches SHA-256(key).digest('hex') exactly", () => {
    const secret = "hash-bit-exactness";
    const adapter = new AesGcmRtspCipherAdapter(secret);
    const streamKey = "abc123streamkey";

    const result = adapter.hashStreamKey(streamKey);
    const expected = createHash("sha256").update(streamKey).digest("hex");

    expect(result).toBe(expected);
  });
});
