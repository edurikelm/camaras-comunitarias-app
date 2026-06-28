/**
 * Pure schedule utilities for camera permission time windows.
 * No imports from infrastructure, Prisma, process.env, or custom errors.
 */

/**
 * Returns true when value is a valid HH:MM 24-hour string.
 * Format: 00:00 to 23:59.
 */
export function isValidHHMM(value: string): boolean {
  return /^([01]\d|2[0-3]):([0-5]\d)$/.test(value);
}

/**
 * Returns the current time as an HH:MM string (24h format).
 * When `now` is omitted it is computed via `new Date()`.
 */
export function nowHHMM(now: Date = new Date()): string {
  const hh = now.getHours().toString().padStart(2, "0");
  const mm = now.getMinutes().toString().padStart(2, "0");
  return `${hh}:${mm}`;
}

/**
 * Checks whether `currentHHMM` falls within the optional schedule range.
 * Comparison is lexicographic (valid for HH:MM in 24h format).
 * When both start and end are absent the schedule is considered unrestricted.
 *
 * Supports overnight ranges: when `scheduleStart > scheduleEnd` the range
 * crosses midnight and is valid when `current >= scheduleStart` OR
 * `current <= scheduleEnd`.
 */
export function isWithinSchedule(
  scheduleStart: string | null,
  scheduleEnd: string | null,
  currentHHMM: string,
): boolean {
  if (!scheduleStart && !scheduleEnd) return true;

  if (scheduleStart && scheduleEnd) {
    // Overnight schedule: start > end means the range crosses midnight.
    // e.g. "22:00"-"06:00" permits any time from 22:00 to 23:59
    // and 00:00 to 06:00.
    if (scheduleStart > scheduleEnd) {
      return currentHHMM >= scheduleStart || currentHHMM <= scheduleEnd;
    }
    // Normal same-day schedule: start <= end.
    return currentHHMM >= scheduleStart && currentHHMM <= scheduleEnd;
  }

  if (scheduleStart && !scheduleEnd) {
    // Only a lower bound — allow if current >= start.
    return currentHHMM >= scheduleStart;
  }

  // Only an upper bound — allow if current <= end.
  return currentHHMM <= scheduleEnd!;
}

/**
 * Returns true when a camera permission is currently active.
 * Combines the `canViewLive` flag with the optional schedule window.
 */
export function isPermissionActiveNow(
  permission: {
    canViewLive: boolean;
    scheduleStart: string | null;
    scheduleEnd: string | null;
  },
  currentHHMM: string,
): boolean {
  return permission.canViewLive && isWithinSchedule(
    permission.scheduleStart,
    permission.scheduleEnd,
    currentHHMM,
  );
}
