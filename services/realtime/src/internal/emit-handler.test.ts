import { describe, it, expect, vi } from "vitest";
import Fastify from "fastify";
import type { Server } from "socket.io";
import { registerEmitHandler } from "./emit-handler.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createMockIO() {
  const emitMock = vi.fn();
  const rooms = new Map<string, Set<string>>();

  const mockTo = vi.fn().mockReturnValue({
    emit: emitMock,
  });

  const mockAdapter = {
    rooms,
  };

  const io = {
    to: mockTo,
    sockets: {
      adapter: mockAdapter,
    },
  } as unknown as Server;

  return { io, mockTo, emitMock, rooms };
}

function createValidConfig() {
  return {
    REALTIME_PORT: 3001,
    SUPABASE_URL: "https://example.supabase.co",
    SUPABASE_JWT_AUDIENCE: "authenticated",
    DATABASE_URL: "postgresql://user:pass@host:5432/db",
    REALTIME_INTERNAL_SECRET: "super-secret-min-16-chars!!",
    CORS_ORIGIN: "http://localhost:3000",
    LOG_LEVEL: "info" as const,
    NODE_ENV: "test" as const,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("POST /internal/emit", () => {
  const validConfig = createValidConfig();
  const validSecret = validConfig.REALTIME_INTERNAL_SECRET;

  const validAlertPayload = {
    type: "alert.created",
    communityId: "0191a123-0000-0000-0000-000000000001",
    audience: {
      roomKeys: ["role:admin-guard:community:0191a123-0000-0000-0000-000000000001"],
      userIds: [],
    },
    payload: {
      alertId: "0191a123-0000-0000-0000-000000000003",
      communityId: "0191a123-0000-0000-0000-000000000001",
      sectorId: null,
      severity: "HIGH",
      type: "THEFT",
      message: "THEFT reportado: test",
      incidentId: "0191a123-0000-0000-0000-000000000004",
      sosEventId: null,
      createdAt: "2026-06-27T12:00:00.000Z",
    },
  };

  const validIncidentPayload = {
    type: "incident.created",
    communityId: "0191a123-0000-0000-0000-000000000001",
    audience: {
      roomKeys: ["role:admin-guard:community:0191a123-0000-0000-0000-000000000001"],
      userIds: [],
    },
    payload: {
      incidentId: "0191a123-0000-0000-0000-000000000004",
      communityId: "0191a123-0000-0000-0000-000000000001",
      sectorId: null,
      type: "THEFT",
      severity: "HIGH",
      status: "OPEN",
      description: "Someone broke into a car",
      location: "Main St",
      createdById: "0191a123-0000-0000-0000-000000000005",
      createdAt: "2026-06-27T12:00:00.000Z",
    },
  };

  it("accepts a valid alert.created payload and emits to specified rooms", async () => {
    const { io, mockTo, emitMock } = createMockIO();

    const app = Fastify({ logger: false });
    registerEmitHandler(app, io, validConfig);
    await app.ready();

    const res = await app.inject({
      method: "POST",
      url: "/internal/emit",
      headers: { "x-internal-secret": validSecret },
      payload: validAlertPayload,
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      ok: true,
      emitted: validAlertPayload.audience.roomKeys,
    });
    expect(mockTo).toHaveBeenCalledWith(
      "role:admin-guard:community:0191a123-0000-0000-0000-000000000001",
    );
    expect(emitMock).toHaveBeenCalledWith(
      "alert.created",
      expect.objectContaining({ alertId: validAlertPayload.payload.alertId }),
    );

    await app.close();
  });

  it("accepts a valid incident.created payload and emits to specified rooms", async () => {
    const { io, mockTo, emitMock } = createMockIO();

    const app = Fastify({ logger: false });
    registerEmitHandler(app, io, validConfig);
    await app.ready();

    const res = await app.inject({
      method: "POST",
      url: "/internal/emit",
      headers: { "x-internal-secret": validSecret },
      payload: validIncidentPayload,
    });

    expect(res.statusCode).toBe(200);
    expect(mockTo).toHaveBeenCalled();
    expect(emitMock).toHaveBeenCalledWith(
      "incident.created",
      expect.objectContaining({ incidentId: validIncidentPayload.payload.incidentId }),
    );

    await app.close();
  });

  it("rejects a request without the internal secret header", async () => {
    const { io } = createMockIO();

    const app = Fastify({ logger: false });
    registerEmitHandler(app, io, validConfig);
    await app.ready();

    const res = await app.inject({
      method: "POST",
      url: "/internal/emit",
      payload: validAlertPayload,
    });

    expect(res.statusCode).toBe(401);
    expect(res.json()).toEqual({ error: "Unauthorized" });

    await app.close();
  });

  it("rejects a request with an incorrect secret", async () => {
    const { io } = createMockIO();

    const app = Fastify({ logger: false });
    registerEmitHandler(app, io, validConfig);
    await app.ready();

    const res = await app.inject({
      method: "POST",
      url: "/internal/emit",
      headers: { "x-internal-secret": "wrong-secret" },
      payload: validAlertPayload,
    });

    expect(res.statusCode).toBe(401);

    await app.close();
  });

  it("rejects a payload that fails Zod validation", async () => {
    const { io } = createMockIO();

    const app = Fastify({ logger: false });
    registerEmitHandler(app, io, validConfig);
    await app.ready();

    // alertId no es UUID válido
    const invalidPayload = {
      ...validAlertPayload,
      payload: { ...validAlertPayload.payload, alertId: "not-a-uuid" },
    };

    const res = await app.inject({
      method: "POST",
      url: "/internal/emit",
      headers: { "x-internal-secret": validSecret },
      payload: invalidPayload,
    });

    expect(res.statusCode).toBe(400);
    expect(res.json()).toHaveProperty("error", "Invalid payload");
    expect(res.json()).toHaveProperty("details");

    await app.close();
  });

  it("emits to multiple rooms when audience contains multiple roomKeys", async () => {
    const { io, mockTo, emitMock, rooms } = createMockIO();

    // Agregar sockets simulados en las rooms
    rooms.set("sector:sector-1", new Set(["socket-1", "socket-2"]));
    rooms.set("role:admin-guard:community:0191a123-0000-0000-0000-000000000001", new Set(["socket-3"]));

    const multiRoomPayload = {
      ...validAlertPayload,
      audience: {
        roomKeys: [
          "sector:sector-1",
          "role:admin-guard:community:0191a123-0000-0000-0000-000000000001",
        ],
        userIds: [],
      },
    };

    const app = Fastify({ logger: false });
    registerEmitHandler(app, io, validConfig);
    await app.ready();

    const res = await app.inject({
      method: "POST",
      url: "/internal/emit",
      headers: { "x-internal-secret": validSecret },
      payload: multiRoomPayload,
    });

    expect(res.statusCode).toBe(200);
    expect(mockTo).toHaveBeenCalledTimes(2);
    expect(emitMock).toHaveBeenCalledTimes(2);

    await app.close();
  });
});
