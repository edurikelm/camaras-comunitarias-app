import { describe, expect, it } from "vitest";
import {
  isValidHHMM,
  nowHHMM,
  isWithinSchedule,
  isPermissionActiveNow,
} from "./schedule";

describe("isValidHHMM", () => {
  it("returns true for valid HH:MM values", () => {
    expect(isValidHHMM("00:00")).toBe(true);
    expect(isValidHHMM("23:59")).toBe(true);
    expect(isValidHHMM("01:30")).toBe(true);
    expect(isValidHHMM("12:05")).toBe(true);
    expect(isValidHHMM("20:45")).toBe(true);
  });

  it("returns false for invalid hour values", () => {
    expect(isValidHHMM("24:00")).toBe(false);
    expect(isValidHHMM("25:30")).toBe(false);
    expect(isValidHHMM("12:60")).toBe(false);
    expect(isValidHHMM("9:00")).toBe(false);
    expect(isValidHHMM("1:00")).toBe(false);
  });

  it("returns false for non-HH:MM formats", () => {
    expect(isValidHHMM("")).toBe(false);
    expect(isValidHHMM("8:00")).toBe(false);
    expect(isValidHHMM("8:0")).toBe(false);
    expect(isValidHHMM("0800")).toBe(false);
    expect(isValidHHMM("8-00")).toBe(false);
    expect(isValidHHMM("8:00:00")).toBe(false);
  });
});

describe("nowHHMM", () => {
  it("returns HH:MM from a given Date", () => {
    const date = new Date("2026-01-15T14:35:00");
    expect(nowHHMM(date)).toBe("14:35");
  });

  it("pads single-digit hours and minutes with zero", () => {
    const date = new Date("2026-01-15T09:05:00");
    expect(nowHHMM(date)).toBe("09:05");
  });

  it("returns midnight correctly", () => {
    const date = new Date("2026-01-15T00:00:00");
    expect(nowHHMM(date)).toBe("00:00");
  });

  it("returns 23:59 correctly", () => {
    const date = new Date("2026-01-15T23:59:00");
    expect(nowHHMM(date)).toBe("23:59");
  });
});

describe("isWithinSchedule", () => {
  // Same-day schedule: start <= end

  it("returns true when both bounds are null (unrestricted)", () => {
    expect(isWithinSchedule(null, null, "00:00")).toBe(true);
    expect(isWithinSchedule(null, null, "23:59")).toBe(true);
  });

  it("returns true when current is at the exact start boundary", () => {
    expect(isWithinSchedule("09:00", "17:00", "09:00")).toBe(true);
  });

  it("returns true when current is at the exact end boundary", () => {
    expect(isWithinSchedule("09:00", "17:00", "17:00")).toBe(true);
  });

  it("returns true when current is within the range", () => {
    expect(isWithinSchedule("09:00", "17:00", "12:30")).toBe(true);
  });

  it("returns false when current is before the start", () => {
    expect(isWithinSchedule("09:00", "17:00", "08:59")).toBe(false);
  });

  it("returns false when current is after the end", () => {
    expect(isWithinSchedule("09:00", "17:00", "17:01")).toBe(false);
  });

  // Overnight schedule: start > end (crosses midnight)

  it("returns true when current is after start (before midnight)", () => {
    expect(isWithinSchedule("22:00", "06:00", "23:00")).toBe(true);
  });

  it("returns true when current is before end (after midnight)", () => {
    expect(isWithinSchedule("22:00", "06:00", "03:00")).toBe(true);
  });

  it("returns false when current is in the gap between end and start", () => {
    expect(isWithinSchedule("22:00", "06:00", "12:00")).toBe(false);
  });

  // Partial bounds

  it("returns true when only scheduleStart is set and current >= start", () => {
    expect(isWithinSchedule("09:00", null, "09:00")).toBe(true);
    expect(isWithinSchedule("09:00", null, "12:00")).toBe(true);
  });

  it("returns false when only scheduleStart is set and current < start", () => {
    expect(isWithinSchedule("09:00", null, "08:59")).toBe(false);
  });

  it("returns true when only scheduleEnd is set and current <= end", () => {
    expect(isWithinSchedule(null, "18:00", "12:00")).toBe(true);
    expect(isWithinSchedule(null, "18:00", "18:00")).toBe(true);
  });

  it("returns false when only scheduleEnd is set and current > end", () => {
    expect(isWithinSchedule(null, "18:00", "18:01")).toBe(false);
  });

});

describe("isPermissionActiveNow", () => {
  it("returns false when canViewLive is false", () => {
    expect(
      isPermissionActiveNow(
        { canViewLive: false, scheduleStart: null, scheduleEnd: null },
        "12:00",
      ),
    ).toBe(false);
  });

  it("returns true when canViewLive is true and no schedule restriction", () => {
    expect(
      isPermissionActiveNow(
        { canViewLive: true, scheduleStart: null, scheduleEnd: null },
        "23:59",
      ),
    ).toBe(true);
  });

  it("returns true when canViewLive is true and current is within schedule", () => {
    expect(
      isPermissionActiveNow(
        { canViewLive: true, scheduleStart: "09:00", scheduleEnd: "17:00" },
        "12:00",
      ),
    ).toBe(true);
  });

  it("returns false when canViewLive is true but current is outside schedule", () => {
    expect(
      isPermissionActiveNow(
        { canViewLive: true, scheduleStart: "09:00", scheduleEnd: "17:00" },
        "08:00",
      ),
    ).toBe(false);
  });
});
