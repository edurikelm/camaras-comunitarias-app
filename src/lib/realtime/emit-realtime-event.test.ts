import { describe, it, expect, vi } from "vitest";
import { emitRealtimeEvent } from "./emit-realtime-event";

const VALID_ALERT_INPUT = {
  type: "alert.created" as const,
  communityId: "0191a123-0000-0000-0000-000000000001",
  audience: {
    roomKeys: ["role:admin-guard:community:0191a123-0000-0000-0000-000000000001"],
    userIds: [],
  },
  payload: {
    alertId: "0191a123-0000-0000-0000-000000000003",
    communityId: "0191a123-0000-0000-0000-000000000001",
    sectorId: null,
    severity: "HIGH" as const,
    type: "THEFT",
    message: "THEFT reportado: test",
    incidentId: "0191a123-0000-0000-0000-000000000004",
    sosEventId: null,
    createdAt: "2026-06-27T12:00:00.000Z",
  },
};

describe("emitRealtimeEvent", () => {
  it("success first try: single call, no warning", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
    });

    await emitRealtimeEvent(VALID_ALERT_INPUT, { fetchFn: mockFetch });

    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("success after 5xx: 3 calls total, no intermediate warnings (5xx is silently retried)", async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 500 })
      .mockResolvedValueOnce({ ok: false, status: 500 })
      .mockResolvedValueOnce({ ok: true, status: 200 });

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    await emitRealtimeEvent(VALID_ALERT_INPUT, { fetchFn: mockFetch });

    // 5xx es retryable: se reintenta silenciosamente sin warning intermedio
    expect(mockFetch).toHaveBeenCalledTimes(3);
    expect(warnSpy).toHaveBeenCalledTimes(0);

    warnSpy.mockRestore();
  });

  it("4xx no retry: single call, warning logged", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
    });

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    await emitRealtimeEvent(VALID_ALERT_INPUT, { fetchFn: mockFetch });

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalledWith(
      "[realtime] emit alert.created failed with 400, not retrying",
    );

    warnSpy.mockRestore();
  });

  it("3 attempts exhausted: 3 calls, final dropping warning", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
    });

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    await emitRealtimeEvent(VALID_ALERT_INPUT, { fetchFn: mockFetch });

    expect(mockFetch).toHaveBeenCalledTimes(3);
    // Solo un warning final cuando se agotan los intentos
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenLastCalledWith(
      "[realtime] emit alert.created failed after 3 attempts, dropping",
    );

    warnSpy.mockRestore();
  });

  it("network error (fetch rejects): 3 attempts, then final dropping warning", async () => {
    // Simula ECONNREFUSED o AbortError (timeout). El catch del helper
    // trata los rechazos como retryable igual que 5xx.
    const mockFetch = vi.fn().mockRejectedValue(new Error("ECONNREFUSED"));

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    await emitRealtimeEvent(VALID_ALERT_INPUT, { fetchFn: mockFetch });

    expect(mockFetch).toHaveBeenCalledTimes(3);
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenLastCalledWith(
      "[realtime] emit alert.created failed after 3 attempts, dropping",
    );

    warnSpy.mockRestore();
  });

  it("network error transitorio: success al 2do intento tras un reject", async () => {
    const mockFetch = vi
      .fn()
      .mockRejectedValueOnce(new Error("ETIMEDOUT"))
      .mockResolvedValueOnce({ ok: true, status: 200 });

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    await emitRealtimeEvent(VALID_ALERT_INPUT, { fetchFn: mockFetch });

    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(warnSpy).toHaveBeenCalledTimes(0);

    warnSpy.mockRestore();
  });
});
