import type { LiveStreamTokenIssuer } from "@/domain/community/camera/live-stream-token-issuer";
import { JoseLiveStreamTokenIssuer } from "./jose-live-stream-token-issuer";

/**
 * Factory that builds a LiveStreamTokenIssuer from environment variables.
 *
 * @throws Error if CAMERA_STREAM_SECRET or NEXT_PUBLIC_MEDIA_SERVER_URL is absent.
 */
export function createLiveStreamTokenIssuerFromEnv(): LiveStreamTokenIssuer {
  const streamSecret = process.env.CAMERA_STREAM_SECRET;
  if (!streamSecret) {
    throw new Error(
      "CAMERA_STREAM_SECRET environment variable is not configured",
    );
  }

  const mediaServerUrl = process.env.NEXT_PUBLIC_MEDIA_SERVER_URL;
  if (!mediaServerUrl) {
    throw new Error(
      "NEXT_PUBLIC_MEDIA_SERVER_URL environment variable is not configured",
    );
  }

  return new JoseLiveStreamTokenIssuer({
    streamSecret,
    mediaServerUrl,
  });
}
