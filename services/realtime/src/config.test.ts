/**
 * Tests para `loadConfig` y `resolveJwtIssuer`.
 *
 * Cobertura:
 * - resolveJwtIssuer sin SUPABASE_JWT_ISSUER devuelve `${SUPABASE_URL}/auth/v1`
 *   (default de Supabase GoTrue).
 * - resolveJwtIssuer con SUPABASE_JWT_ISSUER explicito respeta el override.
 * - loadConfig acepta el env var opcional sin fallar.
 * - loadConfig rechaza URLs malformadas.
 *
 * Por que este test existe:
 * - Antes de este fix, `server.ts` pasaba `jwtIssuer: config.SUPABASE_URL` sin
 *   el sufijo `/auth/v1`, lo que producia `ERR_JWT_CLAIM_VALIDATION_FAILED` y
 *   rechazaba TODAS las conexiones WebSocket. El bug paso desapercibido porque
 *   no habia un test que verificara el formato del issuer.
 * - Este test bloquea la regresion: si alguien borra el sufijo /auth/v1, falla.
 */
import { describe, it, expect } from "vitest";
import { resolveJwtIssuer, loadConfig } from "./config.js";

const VALID_BASE_ENV = {
  REALTIME_PORT: "3001",
  SUPABASE_URL: "https://kqmpwgbgaxunbmkbptir.supabase.co",
  SUPABASE_JWT_AUDIENCE: "authenticated",
  DATABASE_URL: "postgresql://user:pass@host:5432/db",
  REALTIME_INTERNAL_SECRET: "un-secret-de-al-menos-16-chars-aqui",
  CORS_ORIGIN: "http://localhost:3000",
  LOG_LEVEL: "info",
  NODE_ENV: "test",
};

describe("resolveJwtIssuer", () => {
  it("devuelve `${SUPABASE_URL}/auth/v1` cuando no hay override", () => {
    const result = resolveJwtIssuer({
      SUPABASE_URL: "https://kqmpwgbgaxunbmkbptir.supabase.co",
    });
    expect(result).toBe("https://kqmpwgbgaxunbmkbptir.supabase.co/auth/v1");
  });

  it("respeta el override explicito de SUPABASE_JWT_ISSUER", () => {
    const result = resolveJwtIssuer({
      SUPABASE_URL: "https://kqmpwgbgaxunbmkbptir.supabase.co",
      SUPABASE_JWT_ISSUER: "https://custom-issuer.example.com/auth/v1",
    });
    expect(result).toBe("https://custom-issuer.example.com/auth/v1");
  });

  it("el default NUNCA es solo SUPABASE_URL (regression test del bug original)", () => {
    // Bug que arreglamos: jwtIssuer era config.SUPABASE_URL (sin /auth/v1),
    // producia ERR_JWT_CLAIM_VALIDATION_FAILED para todos los handshakes.
    const result = resolveJwtIssuer({
      SUPABASE_URL: "https://kqmpwgbgaxunbmkbptir.supabase.co",
    });
    expect(result).not.toBe("https://kqmpwgbgaxunbmkbptir.supabase.co");
    expect(result.endsWith("/auth/v1")).toBe(true);
  });
});

describe("loadConfig", () => {
  it("acepta el env sin SUPABASE_JWT_ISSUER (usa default)", () => {
    const config = loadConfig(VALID_BASE_ENV);
    expect(config.SUPABASE_URL).toBe("https://kqmpwgbgaxunbmkbptir.supabase.co");
    expect(config.SUPABASE_JWT_ISSUER).toBeUndefined();
  });

  it("acepta SUPABASE_JWT_ISSUER opcional cuando esta definido", () => {
    const config = loadConfig({
      ...VALID_BASE_ENV,
      SUPABASE_JWT_ISSUER: "https://kqmpwgbgaxunbmkbptir.supabase.co/auth/v1",
    });
    expect(config.SUPABASE_JWT_ISSUER).toBe("https://kqmpwgbgaxunbmkbptir.supabase.co/auth/v1");
  });

  it("rechaza SUPABASE_JWT_ISSUER con URL malformada", () => {
    expect(() =>
      loadConfig({
        ...VALID_BASE_ENV,
        SUPABASE_JWT_ISSUER: "not-a-url",
      }),
    ).toThrow(/Invalid environment variables/);
  });
});