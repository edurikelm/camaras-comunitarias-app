import { describe, it, expect } from "vitest";
import {
  mapSupabaseAuthError,
  SUPABASE_AUTH_ERROR_MESSAGES,
  type SupabaseAuthErrorCode,
} from "./supabase-auth-error-mapper";

describe("mapSupabaseAuthError", () => {
  it("mapea email_address_invalid al mensaje en español", () => {
    const error = {
      code: "email_address_invalid",
      message: 'Email address "vecina.test.001@example.com" is invalid',
    };
    expect(mapSupabaseAuthError(error)).toBe(
      SUPABASE_AUTH_ERROR_MESSAGES.email_address_invalid,
    );
  });

  it("mapea email_not_confirmed al mensaje en español", () => {
    const error = {
      code: "email_not_confirmed",
      message: "Email not confirmed",
    };
    expect(mapSupabaseAuthError(error)).toBe(
      SUPABASE_AUTH_ERROR_MESSAGES.email_not_confirmed,
    );
  });

  it("mapea invalid_credentials al mensaje en español", () => {
    const error = {
      code: "invalid_credentials",
      message: "Invalid login credentials",
    };
    expect(mapSupabaseAuthError(error)).toBe(
      SUPABASE_AUTH_ERROR_MESSAGES.invalid_credentials,
    );
  });

  it("mapea over_email_send_rate_limit al mensaje en español", () => {
    const error = {
      code: "over_email_send_rate_limit",
      message: "Too many email attempts",
    };
    expect(mapSupabaseAuthError(error)).toBe(
      SUPABASE_AUTH_ERROR_MESSAGES.over_email_send_rate_limit,
    );
  });

  it("devuelve mensaje default para código desconocido", () => {
    const error = { code: "foo_bar", message: "Some scary raw error message" };
    expect(mapSupabaseAuthError(error)).toBe(
      SUPABASE_AUTH_ERROR_MESSAGES.default,
    );
  });

  it("devuelve mensaje default para error sin código", () => {
    const error = { message: "Email address is invalid" };
    expect(mapSupabaseAuthError(error)).toBe(
      SUPABASE_AUTH_ERROR_MESSAGES.default,
    );
  });

  it("devuelve mensaje default para error con código undefined", () => {
    const error = { code: undefined as unknown, message: "Raw message" };
    expect(mapSupabaseAuthError(error)).toBe(
      SUPABASE_AUTH_ERROR_MESSAGES.default,
    );
  });

  it("devuelve mensaje default para null", () => {
    expect(mapSupabaseAuthError(null)).toBe(
      SUPABASE_AUTH_ERROR_MESSAGES.default,
    );
  });

  it("devuelve mensaje default para undefined", () => {
    expect(mapSupabaseAuthError(undefined)).toBe(
      SUPABASE_AUTH_ERROR_MESSAGES.default,
    );
  });

  it("devuelve mensaje default para string vacío", () => {
    expect(mapSupabaseAuthError("")).toBe(
      SUPABASE_AUTH_ERROR_MESSAGES.default,
    );
  });

  it("reconoce error_code en lugar de code (compatibilidad)", () => {
    const error = {
      error_code: "email_not_confirmed",
      message: "Email not confirmed",
    };
    expect(mapSupabaseAuthError(error)).toBe(
      SUPABASE_AUTH_ERROR_MESSAGES.email_not_confirmed,
    );
  });

  it("nunca devuelve el mensaje crudo de Supabase", () => {
    const scaryRawMessage =
      'Email address "vecina.test.001@example.com" is invalid — DO NOT SHOW THIS';
    const error = { code: "email_address_invalid", message: scaryRawMessage };
    const result = mapSupabaseAuthError(error);
    expect(result).not.toContain("vecina.test.001");
    expect(result).not.toContain("DO NOT SHOW THIS");
    expect(result).toBe(SUPABASE_AUTH_ERROR_MESSAGES.email_address_invalid);
  });

  it("prioriza code sobre error_code cuando ambos están presentes", () => {
    const error = {
      code: "invalid_credentials",
      error_code: "email_not_confirmed",
      message: "Some message",
    };
    expect(mapSupabaseAuthError(error)).toBe(
      SUPABASE_AUTH_ERROR_MESSAGES.invalid_credentials,
    );
  });

  it("SUPABASE_AUTH_ERROR_MESSAGES tiene todas las claves esperadas", () => {
    const expectedCodes: SupabaseAuthErrorCode[] = [
      "email_address_invalid",
      "email_not_confirmed",
      "invalid_credentials",
      "over_email_send_rate_limit",
    ];
    for (const code of expectedCodes) {
      expect(SUPABASE_AUTH_ERROR_MESSAGES).toHaveProperty(code);
    }
    expect(SUPABASE_AUTH_ERROR_MESSAGES).toHaveProperty("default");
  });
});
