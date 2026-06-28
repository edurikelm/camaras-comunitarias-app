import { DomainError, type DomainErrorContext, type DomainErrorResponse } from "@/domain/shared/domain-error";
import { CommunityInvariantError } from "@/domain/community/errors";

/**
 * Port for RTSP URL encryption and stream key hashing.
 *
 * Separates encryption infrastructure from the camera repository.
 * Bit-exactness contract (per ADR-0003):
 * - encryptRtspUrl returns `${ivHex}:${authTagHex}:${ciphertextHex}`
 *   where iv = randomBytes(16), algorithm = aes-256-gcm,
 *   key = SHA-256(CAMERA_RTSP_SECRET).
 * - hashStreamKey returns SHA-256(key).digest("hex") (64 hex chars).
 */
export interface RtspCipherPort {
  encryptRtspUrl(plaintext: string): string;
  hashStreamKey(key: string): string;
}

/**
 * Error thrown when RTSP encryption or key derivation fails.
 *
 * Extends CommunityInvariantError so existing `instanceof CommunityInvariantError`
 * catches keep working. Distinct subclass lets the DomainErrorMapper branch on it
 * for accurate HTTP semantics: encryption failures are 502 Bad Gateway
 * (upstream encryption service failed), not 400 Bad Request.
 */
export class RtspCipherError extends CommunityInvariantError {
  constructor(
    message: string,
    /** Optional underlying error from the crypto operation, for logs only */
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = "RtspCipherError";
  }
  httpResponse(_ctx: DomainErrorContext): DomainErrorResponse {
    return {
      status: 502,
      body: { error: "Encryption service temporarily unavailable" },
      log: () =>
        console.error(
          `[${_ctx.method} ${_ctx.path}] RTSP cipher failure:`,
          this.cause ?? this,
        ),
    };
  }
}
