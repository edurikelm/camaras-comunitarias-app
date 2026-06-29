import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { vi } from "vitest";
import type { FastifyInstance } from "fastify";
import Fastify from "fastify";
import { registerHealthRoutes } from "./health.js";

describe("GET /healthz", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    // Mock de prisma inline — no requiere importar @prisma/client
    const prisma = {
      $queryRaw: vi.fn().mockResolvedValue([{ "?column?": 1 }]),
      $disconnect: vi.fn(),
    };
    app = Fastify({ logger: false });
    registerHealthRoutes(app, prisma);
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  it("retorna 200 con status ok", async () => {
    const res = await app.inject({ method: "GET", url: "/healthz" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: "ok" });
  });
});

describe("GET /readyz", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    const prisma = {
      $queryRaw: vi.fn().mockResolvedValue([{ "?column?": 1 }]),
      $disconnect: vi.fn(),
    };
    app = Fastify({ logger: false });
    registerHealthRoutes(app, prisma);
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  it("retorna 200 cuando Prisma responde correctamente", async () => {
    const res = await app.inject({ method: "GET", url: "/readyz" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: "ready" });
  });
});
