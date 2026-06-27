import { randomBytes, createHmac } from "node:crypto";

/**
 * Generates a cryptographically random, URL-safe invite code.
 * The code is 43 characters of base64url (256 bits of entropy).
 */
export function generateInviteCode(): string {
  return randomBytes(32).toString("base64url");
}

/**
 * Returns the server-side pepper for invitation code hashing.
 * Falls back to "dev-pepper-do-not-use-in-production" when the env var is not set.
 */
export function getInvitePepper(): string {
  return (
    process.env.INVITATION_PEPPER ?? "dev-pepper-do-not-use-in-production"
  );
}

/**
 * SHA-256 hash of the invite code combined with the pepper.
 */
export function hashInviteCode(
  code: string,
  pepper: string = getInvitePepper(),
): string {
  return createHmac("sha256", pepper).update(code).digest("hex");
}
