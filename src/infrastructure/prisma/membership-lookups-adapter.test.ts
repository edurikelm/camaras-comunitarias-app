import { describe, it, expect, vi, beforeEach } from "vitest";
import { createPrismaMembershipLookupsAdapter } from "./membership-lookups-adapter";
import type { MembershipLookupsPort } from "@/domain/community/membership/membership-lookups";
import type { PrismaClient } from "@/generated/prisma/client";

// Minimal mock of the Prisma namespaces used by the adapter
function mockTxClient() {
  const communityFindUniqueMock = vi.fn<() => Promise<unknown>>();
  const communityMemberFindFirstMock = vi.fn<() => Promise<unknown>>();
  const communitySectorFindUniqueMock = vi.fn<() => Promise<unknown>>();
  return {
    community: {
      findUnique: communityFindUniqueMock,
    },
    communityMember: {
      findFirst: communityMemberFindFirstMock,
    },
    communitySector: {
      findUnique: communitySectorFindUniqueMock,
    },
    // Capture refs for assertions
    _communityFindUnique: communityFindUniqueMock,
    _communityMemberFindFirst: communityMemberFindFirstMock,
    _communitySectorFindUnique: communitySectorFindUniqueMock,
  };
}

describe("PrismaMembershipLookupsAdapter", () => {
  let txClient: ReturnType<typeof mockTxClient>;

  beforeEach(() => {
    vi.clearAllMocks();
    txClient = mockTxClient();
  });

  describe("findCommunityById()", () => {
    it("invokes tx.community.findUnique with SELECT {id, name, status}", async () => {
      txClient._communityFindUnique.mockResolvedValue({
        id: "com-1",
        name: "El Buen Vecino",
        status: "ACTIVE",
      });

      const adapter = createPrismaMembershipLookupsAdapter(
        txClient as unknown as PrismaClient,
      );
      await adapter.findCommunityById("com-1");

      expect(txClient._communityFindUnique).toHaveBeenCalledOnce();
      expect(txClient._communityFindUnique).toHaveBeenCalledWith({
        where: { id: "com-1" },
        select: { id: true, name: true, status: true },
      });
    });

    it("returns null when community does not exist", async () => {
      txClient._communityFindUnique.mockResolvedValue(null);

      const adapter = createPrismaMembershipLookupsAdapter(
        txClient as unknown as PrismaClient,
      );
      const result = await adapter.findCommunityById("nonexistent");

      expect(result).toBeNull();
    });
  });

  describe("findActiveAdminMember()", () => {
    it("filters by role ADMIN and status ACTIVE", async () => {
      txClient._communityMemberFindFirst.mockResolvedValue({
        id: "mem-1",
        userId: "user-1",
        communityId: "com-1",
        role: "ADMIN",
        status: "ACTIVE",
      });

      const adapter = createPrismaMembershipLookupsAdapter(
        txClient as unknown as PrismaClient,
      );
      await adapter.findActiveAdminMember("com-1", "user-1");

      expect(txClient._communityMemberFindFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: "user-1", communityId: "com-1", role: "ADMIN", status: "ACTIVE" },
        }),
      );
    });
  });

  describe("findActiveNeighborOrGuardMember()", () => {
    it("filters by role in [NEIGHBOR, GUARD] and status ACTIVE", async () => {
      txClient._communityMemberFindFirst.mockResolvedValue({
        id: "mem-1",
        userId: "user-1",
        communityId: "com-1",
        role: "NEIGHBOR",
        status: "ACTIVE",
      });

      const adapter = createPrismaMembershipLookupsAdapter(
        txClient as unknown as PrismaClient,
      );
      await adapter.findActiveNeighborOrGuardMember("com-1", "user-1");

      expect(txClient._communityMemberFindFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            userId: "user-1",
            communityId: "com-1",
            status: "ACTIVE",
            role: { in: ["NEIGHBOR", "GUARD"] },
          },
        }),
      );
    });
  });

  describe("findActiveMember()", () => {
    it("filters by status ACTIVE only (no role filter)", async () => {
      txClient._communityMemberFindFirst.mockResolvedValue({
        id: "mem-1",
        userId: "user-1",
        communityId: "com-1",
        role: "NEIGHBOR",
        status: "ACTIVE",
      });

      const adapter = createPrismaMembershipLookupsAdapter(
        txClient as unknown as PrismaClient,
      );
      await adapter.findActiveMember("com-1", "user-1");

      expect(txClient._communityMemberFindFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: "user-1", communityId: "com-1", status: "ACTIVE" },
        }),
      );
    });
  });

  describe("findActiveAdminOrGuardMember()", () => {
    it("filters by role in [ADMIN, GUARD] and status ACTIVE", async () => {
      txClient._communityMemberFindFirst.mockResolvedValue({
        id: "mem-1",
        userId: "user-1",
        communityId: "com-1",
        role: "GUARD",
        status: "ACTIVE",
      });

      const adapter = createPrismaMembershipLookupsAdapter(
        txClient as unknown as PrismaClient,
      );
      await adapter.findActiveAdminOrGuardMember("com-1", "user-1");

      expect(txClient._communityMemberFindFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            userId: "user-1",
            communityId: "com-1",
            status: "ACTIVE",
            role: { in: ["ADMIN", "GUARD"] },
          },
        }),
      );
    });
  });

  describe("findSectorById()", () => {
    it("invokes tx.communitySector.findUnique with SELECT {id, communityId, name}", async () => {
      txClient._communitySectorFindUnique.mockResolvedValue({
        id: "sec-1",
        communityId: "com-1",
        name: "Sector A",
      });

      const adapter = createPrismaMembershipLookupsAdapter(
        txClient as unknown as PrismaClient,
      );
      await adapter.findSectorById("sec-1");

      expect(txClient._communitySectorFindUnique).toHaveBeenCalledOnce();
      expect(txClient._communitySectorFindUnique).toHaveBeenCalledWith({
        where: { id: "sec-1" },
        select: { id: true, communityId: true, name: true },
      });
    });
  });

  describe("spread semantics (regression: 5 repos rotos por `...membershipLookups`)", () => {
    // Background: este adapter se usa dentro de 5 Prisma repositorios via
    // `createUnitOfWork(tx)` que retorna `{ ...membershipLookups, ...métodos }`.
    // Una versión anterior envolvía los métodos en una clase — los métodos
    // viven en el PROTOTYPE y el spread SOLO copia own properties, así que el
    // UoW quedaba sin los métodos del port y TODAS las políticas de dominio
    // se rompían a runtime con `TypeError: client.findCommunityById is not a function`.
    //
    // Estos tests garantizan que el adapter sigue siendo spread-safe.

    const expectedMethods: Array<keyof MembershipLookupsPort> = [
      "findCommunityById",
      "findActiveAdminMember",
      "findActiveNeighborOrGuardMember",
      "findActiveMember",
      "findActiveAdminOrGuardMember",
      "findSectorById",
    ];

    it("exposes the 6 port methods as OWN enumerable properties", () => {
      const adapter = createPrismaMembershipLookupsAdapter(
        txClient as unknown as PrismaClient,
      );

      for (const method of expectedMethods) {
        expect(
          Object.prototype.hasOwnProperty.call(adapter, method),
          `adapter.${method} debe ser own property (no prototype)`,
        ).toBe(true);
      }
    });

    it("survives a spread: `{...adapter}` keeps every port method as a callable function", async () => {
      const adapter = createPrismaMembershipLookupsAdapter(
        txClient as unknown as PrismaClient,
      );
      const spreaded = { ...adapter };

      // Si la regresión vuelve, `spreaded` no tendrá estos métodos y TS
      // tampoco se queja porque los types vienen del shape del factory.
      for (const method of expectedMethods) {
        expect(
          typeof spreaded[method],
          `spreaded.${method} debe ser function (no undefined)`,
        ).toBe("function");
      }

      // Verificación funcional: spreaded.findCommunityById debe delegar al tx.
      txClient._communityFindUnique.mockResolvedValue({
        id: "com-1",
        name: "El Buen Vecino",
        status: "ACTIVE",
      });
      const result = await spreaded.findCommunityById("com-1");
      expect(result).toEqual({
        id: "com-1",
        name: "El Buen Vecino",
        status: "ACTIVE",
      });
      expect(txClient._communityFindUnique).toHaveBeenCalledOnce();
    });

    it("does not warn when constructed with a transaction client", () => {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      // Transaction clients do not have $transaction
      const txOnlyClient = {
        community: { findUnique: vi.fn<() => Promise<unknown>>() },
        communityMember: { findFirst: vi.fn<() => Promise<unknown>>() },
        communitySector: { findUnique: vi.fn<() => Promise<unknown>>() },
      };
      createPrismaMembershipLookupsAdapter(
        txOnlyClient as unknown as PrismaClient,
      );
      expect(warnSpy).not.toHaveBeenCalled();
      warnSpy.mockRestore();
    });
  });
});