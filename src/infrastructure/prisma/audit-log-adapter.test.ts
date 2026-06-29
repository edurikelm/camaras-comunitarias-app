import { describe, it, expect, vi, beforeEach } from "vitest";
import { createPrismaAuditLogAdapter } from "./audit-log-adapter";
import type { PrismaClient } from "@/generated/prisma/client";

// Minimal mock of Prisma's auditLog namespace
function mockTxClient() {
  const createMock = vi.fn<() => Promise<unknown>>();
  return {
    auditLog: {
      create: createMock,
    },
    _create: createMock,
  };
}

describe("PrismaAuditLogAdapter", () => {
  let txClient: ReturnType<typeof mockTxClient>;

  beforeEach(() => {
    vi.clearAllMocks();
    txClient = mockTxClient();
  });

  describe("record()", () => {
    it("calls tx.auditLog.create with all required fields", async () => {
      const adapter = createPrismaAuditLogAdapter(
        txClient as unknown as PrismaClient,
      );
      const entry = {
        communityId: "com-1",
        actorId: "user-1",
        action: "CAMERA_REGISTERED",
        entityType: "Camera",
        entityId: "cam-1",
        metadata: { foo: "bar" },
      };

      await adapter.record(entry);

      expect(txClient._create).toHaveBeenCalledOnce();
      expect(txClient._create).toHaveBeenCalledWith({
        data: {
          communityId: "com-1",
          actorId: "user-1",
          action: "CAMERA_REGISTERED",
          entityType: "Camera",
          entityId: "cam-1",
          metadata: { foo: "bar" },
        },
      });
    });

    it("defaults metadata to empty object when omitted", async () => {
      const adapter = createPrismaAuditLogAdapter(
        txClient as unknown as PrismaClient,
      );
      const entry = {
        communityId: "com-1",
        actorId: "user-1",
        action: "INCIDENT_CREATED",
        entityType: "Incident",
        entityId: "inc-1",
      };

      await adapter.record(entry);

      expect(txClient._create).toHaveBeenCalledOnce();
      expect(txClient._create).toHaveBeenCalledWith({
        data: {
          communityId: "com-1",
          actorId: "user-1",
          action: "INCIDENT_CREATED",
          entityType: "Incident",
          entityId: "inc-1",
          metadata: {},
        },
      });
    });

    it("throws AuditLogError on Prisma failure", async () => {
      const failingClient = {
        auditLog: {
          create: vi
            .fn<() => Promise<unknown>>()
            .mockRejectedValue(new Error("DB connection lost")),
        },
      };

      const adapter = createPrismaAuditLogAdapter(
        failingClient as unknown as PrismaClient,
      );
      const entry = {
        communityId: "com-1",
        actorId: "user-1",
        action: "TEST",
        entityType: "Test",
        entityId: "test-1",
      };

      await expect(adapter.record(entry)).rejects.toThrow(
        "Failed to record audit log entry",
      );
    });
  });

  describe("spread semantics (regression: consistencia con membership-lookups-adapter)", () => {
    // Mismo principio que membership-lookups-adapter: una versión anterior
    // envolvía `record` en una clase y ponía el método en el prototype.
    // Si algún día alguien hace `{...auditLog}` en lugar de `auditLog.record(...)`,
    // la versión de clase dejaría la llamada silenciosamente rota. Este test
    // blinda el shape del factory.

    it("exposes `record` as an OWN enumerable property", () => {
      const adapter = createPrismaAuditLogAdapter(
        txClient as unknown as PrismaClient,
      );
      expect(
        Object.prototype.hasOwnProperty.call(adapter, "record"),
        "adapter.record debe ser own property (no prototype)",
      ).toBe(true);
    });

    it("survives a spread: `{...adapter}.record` is callable", async () => {
      const adapter = createPrismaAuditLogAdapter(
        txClient as unknown as PrismaClient,
      );
      const spreaded = { ...adapter };

      expect(typeof spreaded.record).toBe("function");

      await spreaded.record({
        communityId: "com-1",
        actorId: "user-1",
        action: "CAMERA_REGISTERED",
        entityType: "Camera",
        entityId: "cam-1",
      });
      expect(txClient._create).toHaveBeenCalledOnce();
    });

    it("does not warn when constructed with a transaction client", () => {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      // Transaction clients do not have $transaction
      const txOnlyClient = {
        auditLog: { create: vi.fn<() => Promise<unknown>>() },
      };
      createPrismaAuditLogAdapter(txOnlyClient as unknown as PrismaClient);
      expect(warnSpy).not.toHaveBeenCalled();
      warnSpy.mockRestore();
    });
  });
});