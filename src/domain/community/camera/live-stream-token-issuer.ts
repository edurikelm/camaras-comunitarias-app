/**
 * Port (hexagonal interface) for issuing live-stream tokens.
 *
 * Implementations are infrastructure adapters (e.g. JoseLiveStreamTokenIssuer).
 *
 * Errors:
 * - If required environment configuration is absent, throws `Error` with a
 *   descriptive message.
 * - Errors from the underlying JWT library (jose) propagate unchanged.
 */
export type IssueLiveStreamTokenInput = {
  cameraId: string;
  userId: string;
  expiresAt: Date;
};

export type IssuedLiveStreamToken = {
  streamUrl: string;
  token: string;
  expiresAt: Date;
};

export interface LiveStreamTokenIssuer {
  issue(input: IssueLiveStreamTokenInput): Promise<IssuedLiveStreamToken>;
}
