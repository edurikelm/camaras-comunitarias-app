import { describe, it, expect } from "vitest";
import { calculateAudience } from "./audience-calculator";
import {
  communityRoom,
  roleAdminGuardRoom,
  sectorRoom,
} from "@shared/realtime/rooms";

type Severity = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

describe("calculateAudience", () => {
  const communityId = "0191a123-0000-0000-0000-000000000001";
  const sectorId = "0191a123-0000-0000-0000-000000000002";

  it("LOW sin sector → solo roleAdminGuardRoom", () => {
    const result = calculateAudience({
      communityId,
      sectorId: null,
      severity: "LOW" as Severity,
    });
    expect(result.roomKeys).toEqual([roleAdminGuardRoom(communityId)]);
  });

  it("MEDIUM con sector → sectorRoom + roleAdminGuardRoom", () => {
    const result = calculateAudience({
      communityId,
      sectorId,
      severity: "MEDIUM" as Severity,
    });
    expect(result.roomKeys).toEqual([
      sectorRoom(sectorId),
      roleAdminGuardRoom(communityId),
    ]);
  });

  it("HIGH con sector → sectorRoom + roleAdminGuardRoom", () => {
    const result = calculateAudience({
      communityId,
      sectorId,
      severity: "HIGH" as Severity,
    });
    expect(result.roomKeys).toEqual([
      sectorRoom(sectorId),
      roleAdminGuardRoom(communityId),
    ]);
  });

  it("HIGH sin sector → communityRoom + roleAdminGuardRoom", () => {
    const result = calculateAudience({
      communityId,
      sectorId: null,
      severity: "HIGH" as Severity,
    });
    expect(result.roomKeys).toEqual([
      communityRoom(communityId),
      roleAdminGuardRoom(communityId),
    ]);
  });

  it("CRITICAL con sector → mismo path que MEDIUM/HIGH con sector", () => {
    const result = calculateAudience({
      communityId,
      sectorId,
      severity: "CRITICAL" as Severity,
    });
    expect(result.roomKeys).toEqual([
      sectorRoom(sectorId),
      roleAdminGuardRoom(communityId),
    ]);
  });
});
