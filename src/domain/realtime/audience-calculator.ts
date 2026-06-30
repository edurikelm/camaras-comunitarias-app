/**
 * Calculador de audience para eventos realtime.
 * Decide a qué rooms Socket.IO se emite un evento según severidad y sector.
 *
 * Sigue el ADR-0017 sección f).
 */

import { AlertSeverity } from "@shared/realtime/events/incident-events";
import {
  communityRoom,
  roleAdminGuardRoom,
  sectorRoom,
} from "@shared/realtime/rooms";

export type CalculateAudienceInput = {
  communityId: string;
  sectorId: string | null;
  severity: AlertSeverity;
};

/**
 * Calcula las rooms destino para un evento realtime.
 *
 * - LOW → solo admin-guard (notificación interna)
 * - MEDIUM/HIGH/CRITICAL con sector → sector + admin-guard
 * - MEDIUM/HIGH/CRITICAL sin sector → comunidad + admin-guard
 *
 * La diferenciación visual CRITICAL queda fuera del MVP
 * (se cubre uniformemente con el mismo path que HIGH/MEDIUM con sector).
 */
export function calculateAudience(input: CalculateAudienceInput): {
  roomKeys: string[];
} {
  const { communityId, sectorId, severity } = input;

  if (severity === "LOW") {
    return { roomKeys: [roleAdminGuardRoom(communityId)] };
  }

  // MEDIUM, HIGH, CRITICAL: si hay sector → sector + admin-guard
  if (sectorId) {
    return {
      roomKeys: [sectorRoom(sectorId), roleAdminGuardRoom(communityId)],
    };
  }

  // Sin sector → comunidad + admin-guard
  return {
    roomKeys: [communityRoom(communityId), roleAdminGuardRoom(communityId)],
  };
}
