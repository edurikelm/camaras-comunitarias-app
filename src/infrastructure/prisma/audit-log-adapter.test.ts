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
    $transaction: undefined,
  };
}

function mockPrismaClient() {
  const createMock = vi.fn<() => Promise<unknown>>();
  return {
    auditLog: {
      create: createMock,
    },
    $transaction: undefined,
  };
}

describe("PrismaAuditLogAdapter", () => {
  let txClient: ReturnType<typeof mockTxClient>;
  let prismaClient: ReturnType<typeof mockPrismaClient>;

  beforeEach(() => {
    vi.clearAllMocks();
    txClient = mockTxClient();
    prismaClient = mockPrismaClient();
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

      expect(txClient.auditLog.create).toHaveBeenCalledOnce();
      expect(txClient.auditLog.create).toHaveBeenCalledWith({
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

      expect(txClient.auditLog.create).toHaveBeenCalledOnce();
      expect(txClient.auditLog.create).toHaveBeenCalledWith({
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
          create: vi.fn<() => Promise<unknown>>().mockRejectedValue(
            new Error("DB connection lost"),
          ),
        },
        $transaction: undefined,
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

    it("does not warn when given a transaction client", async () => {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      // Transaction clients do not have $transaction
      const txClient = {
        auditLog: { create: vi.fn<() => Promise<unknown>>() },
      };
      createPrismaAuditLogAdapter(txClient as unknown as PrismaClient);
      expect(warnSpy).not.toHaveBeenCalled();
      warnSpy.mockRestore();
    });
  });
});
