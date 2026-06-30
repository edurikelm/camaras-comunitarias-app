/**
 * Helper para emitir eventos realtime al servicio de Socket.IO.
 * HTTP POST a /internal/emit con retry + timeout corto.
 * Entrega es best-effort: si falla, el evento se descarta y se loguea warning.
 *
 * Sigue el ADR-0017 sección d).
 */

import { z } from "zod";

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

const EmitPayloadSchema = z.discriminatedUnion("type", [
  // alert.created
  z.object({
    type: z.literal("alert.created"),
    communityId: z.string(),
    audience: z.object({
      roomKeys: z.array(z.string()),
      userIds: z.array(z.string()),
    }),
    payload: z.object({
      alertId: z.string(),
      communityId: z.string(),
      sectorId: z.string().uuid().nullable(),
      severity: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]),
      type: z.string(),
      message: z.string(),
      incidentId: z.string().uuid().nullable(),
      sosEventId: z.string().uuid().nullable(),
      createdAt: z.string(),
    }),
  }),
  // incident.created
  z.object({
    type: z.literal("incident.created"),
    communityId: z.string(),
    audience: z.object({
      roomKeys: z.array(z.string()),
      userIds: z.array(z.string()),
    }),
    payload: z.object({
      incidentId: z.string(),
      communityId: z.string(),
      sectorId: z.string().uuid().nullable(),
      type: z.enum([
        "THEFT",
        "SUSPICIOUS_PERSON",
        "SUSPICIOUS_VEHICLE",
        "EMERGENCY",
        "ACCIDENT",
        "OTHER",
      ]),
      severity: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]),
      status: z.enum(["OPEN", "REVIEWING", "CLOSED"]),
      description: z.string(),
      location: z.string().nullable(),
      createdById: z.string(),
      createdAt: z.string(),
    }),
  }),
]);

export type EmitInput = z.infer<typeof EmitPayloadSchema>;

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

export type EmitRealtimeEventOptions = {
  fetchFn?: typeof fetch;
};

/**
 * Emite un evento realtime al servicio de Socket.IO via HTTP POST.
 *
 * - 3 intentos con timeout de 3000ms por intento.
 * - Backoff lineal: 200ms × número de intento.
 * - 5xx, 408, 429 → retry; 4xx (no 408/429) → no retry, warning y salir.
 * - Si se agotan los intentos → warning y se descarta (no propaga excepción).
 *
 * Es best-effort: el llamador no debe intentar hacer rollback si este falla.
 */
export async function emitRealtimeEvent(
  input: EmitInput,
  options: EmitRealtimeEventOptions = {},
): Promise<void> {
  const url =
    process.env.REALTIME_INTERNAL_URL ?? "http://localhost:3001/internal/emit";
  const internalSecret = process.env.REALTIME_INTERNAL_SECRET ?? "";
  const maxAttempts = 3;
  const timeoutMs = 3000;
  const fetchFn = options.fetchFn ?? fetch;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetchFn(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Internal-Secret": internalSecret,
        },
        body: JSON.stringify(input),
        signal: controller.signal,
      });

      clearTimeout(timer);

      if (res.ok) {
        return; // éxito
      }

      // 4xx que no son retryable: no tiene sentido insistir
      if (res.status >= 400 && res.status < 500 && res.status !== 408 && res.status !== 429) {
        console.warn(
          `[realtime] emit ${input.type} failed with ${res.status}, not retrying`,
        );
        return;
      }

      // 5xx o 408/429 → retry
      if (attempt < maxAttempts) {
        await new Promise((r) => setTimeout(r, 200 * attempt));
      }
    } catch (err) {
      clearTimeout(timer);
      // network error o timeout: retry
      if (attempt < maxAttempts) {
        await new Promise((r) => setTimeout(r, 200 * attempt));
      }
    }
  }

  console.warn(
    `[realtime] emit ${input.type} failed after ${maxAttempts} attempts, dropping`,
  );
}
