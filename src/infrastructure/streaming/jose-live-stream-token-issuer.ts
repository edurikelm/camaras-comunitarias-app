import { SignJWT } from "jose";
import type {
  IssueLiveStreamTokenInput,
  IssuedLiveStreamToken,
  LiveStreamTokenIssuer,
} from "@/domain/community/camera/live-stream-token-issuer";

export type JoseLiveStreamTokenIssuerDeps = {
  streamSecret: string;
  mediaServerUrl: string;
};

/**
 * Adapter that implements LiveStreamTokenIssuer using jose SignJWT.
 *
 * The constructor receives its dependencies explicitly (no process.env reads).
 * If `streamSecret` is empty the JWT will be signed with an empty key — callers
 * should validate before constructing this instance if that is undesired.
 */
export class JoseLiveStreamTokenIssuer implements LiveStreamTokenIssuer {
  private readonly secret: Uint8Array;
  private readonly mediaServerUrl: string;

  constructor({ streamSecret, mediaServerUrl }: JoseLiveStreamTokenIssuerDeps) {
    if (!streamSecret) {
      throw new Error("streamSecret is required");
    }
    this.secret = new TextEncoder().encode(streamSecret);
    this.mediaServerUrl = mediaServerUrl;
  }

  async issue(input: IssueLiveStreamTokenInput): Promise<IssuedLiveStreamToken> {
    const { cameraId, userId, expiresAt } = input;

    const jwt = await new SignJWT({ cameraId, userId })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime(Math.floor(expiresAt.getTime() / 1000))
      .sign(this.secret);

    const streamUrl = `${this.mediaServerUrl}/stream/${cameraId}?token=${jwt}`;

    return {
      streamUrl,
      token: jwt,
      expiresAt,
    };
  }
}
