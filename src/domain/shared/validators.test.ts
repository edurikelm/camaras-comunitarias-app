import { describe, expect, it } from "vitest";
import { isUuid, isRtspUrl, isOneOf } from "./validators";

describe("isUuid", () => {
  it("returns true for a valid lowercase UUID", () => {
    expect(isUuid("00000000-0000-0000-0000-000000000000")).toBe(true);
  });

  it("returns true for a valid uppercase UUID", () => {
    expect(isUuid("AAAAAAAA-BBBB-CCCC-DDDD-EEEEEEEEEEEE")).toBe(true);
  });

  it("returns true for a mixed-case valid UUID", () => {
    expect(isUuid("a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d")).toBe(true);
  });

  it("returns false for a string without hyphens", () => {
    expect(isUuid("00000000000000000000000000000000")).toBe(false);
  });

  it("returns false for an empty string", () => {
    expect(isUuid("")).toBe(false);
  });

  it("returns false for null", () => {
    expect(isUuid(null)).toBe(false);
  });

  it("returns false for undefined", () => {
    expect(isUuid(undefined)).toBe(false);
  });

  it("returns false for a number", () => {
    expect(isUuid(12345678 as unknown)).toBe(false);
  });

  it("returns false for a string that is empty after trimming", () => {
    expect(isUuid("   ")).toBe(false);
  });

  it("returns false for a boolean", () => {
    expect(isUuid(true as unknown)).toBe(false);
  });

  it("returns false for an array", () => {
    expect(isUuid([] as unknown)).toBe(false);
  });
});

describe("isRtspUrl", () => {
  it("returns true for a valid RTSP URL with IP and stream path", () => {
    expect(isRtspUrl("rtsp://192.168.1.100:554/stream1")).toBe(true);
  });

  it("returns true for a valid RTSP URL with query string", () => {
    expect(isRtspUrl("rtsp://192.168.1.100:554/stream1?param=value")).toBe(true);
  });

  it("returns true for a valid RTSP URL with hostname", () => {
    expect(isRtspUrl("rtsp://camera.example.com/stream")).toBe(true);
  });

  it("returns false for an empty string", () => {
    expect(isRtspUrl("")).toBe(false);
  });

  it("returns false for http:// URL", () => {
    expect(isRtspUrl("http://example.com/stream")).toBe(false);
  });

  it("returns false for RTSP URL without host", () => {
    expect(isRtspUrl("rtsp:///stream")).toBe(false);
  });

  it("returns false for RTSP URL with spaces", () => {
    expect(isRtspUrl("rtsp://192.168.1.100:554/stream with spaces")).toBe(false);
  });

  it("returns false for a string that is empty after trimming whitespace", () => {
    expect(isRtspUrl("   ")).toBe(false);
  });

  it("returns false for null", () => {
    expect(isRtspUrl(null)).toBe(false);
  });

  it("returns false for undefined", () => {
    expect(isRtspUrl(undefined)).toBe(false);
  });
});

describe("isOneOf", () => {
  const allowed = ["APPROVE", "REJECT"] as const;

  it("returns true when value is in the allowed set", () => {
    expect(isOneOf("APPROVE", allowed)).toBe(true);
    expect(isOneOf("REJECT", allowed)).toBe(true);
  });

  it("returns false when value is not in the allowed set", () => {
    expect(isOneOf("INVALID", allowed)).toBe(false);
    expect(isOneOf("approve", allowed)).toBe(false);
  });

  it("returns false for null", () => {
    expect(isOneOf(null, allowed)).toBe(false);
  });

  it("returns false for undefined", () => {
    expect(isOneOf(undefined, allowed)).toBe(false);
  });

  it("returns false for an empty allowed set", () => {
    expect(isOneOf("anything", [])).toBe(false);
  });

  it("returns true for a string value that exactly matches one of multiple options", () => {
    const options = ["ACCEPT", "REJECT"] as const;
    expect(isOneOf("ACCEPT", options)).toBe(true);
    expect(isOneOf("REJECT", options)).toBe(true);
  });
});
