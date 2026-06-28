import { randomBytes, createCipheriv, createDecipheriv, createHash } from "node:crypto";
import type { RtspCipherPort } from "@/domain/community/camera/rtsp-cipher";
import { RtspCipherError } from "@/domain/community/camera/rtsp-cipher";

const AES_ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 16;

/**
 * AES-256-GCM adapter for RTSP URL encryption.
 *
 * Bit-exact implementation of the original `encryptRTSP` and `hashStreamKey`
 * helpers from `camera-repository.ts` (ADR-0003 contract).
 */
export class AesGcmRtspCipherAdapter implements RtspCipherPort {
  private readonly key: Buffer;

  constructor(secret: string) {
    this.key = createHash("sha256").update(secret).digest();
  }

  encryptRtspUrl(plaintext: string): string {
    const iv = randomBytes(IV_LENGTH);
    const cipher = createCipheriv(AES_ALGORITHM, this.key, iv);

    let encrypted = cipher.update(plaintext, "utf8", "hex");
    encrypted += cipher.final("hex");

    const authTag = cipher.getAuthTag().toString("hex");

    return `${iv.toString("hex")}:${authTag}:${encrypted}`;
  }

  hashStreamKey(key: string): string {
    return createHash("sha256").update(key).digest("hex");
  }
}

/**
 * Factory that creates an AesGcmRtspCipherAdapter from the CAMERA_RTSP_SECRET env var.
 *
 * Validates the secret once at construction; the adapter is safe to reuse.
 *
 * @throws RtspCipherError if CAMERA_RTSP_SECRET is not set
 */
export function createRtspCipherFromEnv(): RtspCipherPort {
  const secret = process.env.CAMERA_RTSP_SECRET;
  if (!secret) {
    throw new RtspCipherError(
      "CAMERA_RTSP_SECRET environment variable is required for RTSP encryption",
    );
  }
  return new AesGcmRtspCipherAdapter(secret);
}
