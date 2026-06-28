const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const RTSP_REGEX = /^rtsp:\/\/[^\s\/]+(\/[^\s]*)?(\?[^\s]*)?$/i;

/**
 * Returns true if value is a valid UUID v4 string (case-insensitive).
 */
export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_REGEX.test(value);
}

/**
 * Returns true if value is a valid RTSP URL with at least host component.
 * Trims whitespace before testing.
 *
 * Note: only `rtsp://` is supported. `rtsps://` (RTSP over TLS) is NOT
 * accepted by this regex. If the MVP ever needs to ingest `rtsps://`
 * streams, extend the regex to `/^rtsps?:\/\/...` and update the
 * camera management rules in CONTEXT.md.
 */
export function isRtspUrl(value: unknown): value is string {
  return typeof value === "string" && RTSP_REGEX.test(value.trim());
}

/**
 * Returns true if value is exactly one of the allowed literals.
 */
export function isOneOf<T extends string>(
  value: unknown,
  allowed: readonly T[],
): value is T {
  return typeof value === "string" && (allowed as readonly string[]).includes(value);
}
