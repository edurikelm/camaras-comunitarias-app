/**
 * Mapa de errores de Supabase Auth a mensajes en español.
 *
 * Nunca se devuelve el mensaje crudo de Supabase (`error.message`).
 * Siempre se mapea por `error.code` — si el código no está reconocido
 * se devuelve el mensaje genérico.
 *
 * @supabase-js 2.108.2 usa `error.code` para códigos de error de Auth.
 * Algunos mensajes antiguos pueden usar `error.error_code`; se verifican ambos.
 */

/** Códigos de error conocidos de Supabase Auth. */
export type SupabaseAuthErrorCode =
  | "email_address_invalid"
  | "email_not_confirmed"
  | "invalid_credentials"
  | "over_email_send_rate_limit";

/** Mensajes de error mapeados a español. */
export const SUPABASE_AUTH_ERROR_MESSAGES: Record<
  SupabaseAuthErrorCode | "default",
  string
> = {
  email_address_invalid:
    "El formato del correo no es válido. Verificá e intentá de nuevo.",
  email_not_confirmed:
    "Revisá tu casilla y confirmá el correo para activar la cuenta.",
  invalid_credentials: "Correo o contraseña incorrectos.",
  over_email_send_rate_limit: "Demasiados intentos. Esperá un momento.",
  default: "Ocurrió un error. Intentá de nuevo en unos minutos.",
};

/**
 * Obtiene el código de error de un objeto de error de Supabase Auth.
 * Verifica tanto `code` como `error_code` por compatibilidad.
 */
function getErrorCode(error: unknown): string | undefined {
  if (error && typeof error === "object") {
    const e = error as Record<string, unknown>;
    if (typeof e.code === "string") return e.code;
    if (typeof e.error_code === "string") return e.error_code;
  }
  return undefined;
}

/**
 * Mapea un error de Supabase Auth a un mensaje en español.
 *
 * - Si `error.code` (o `error.error_code`) coincide con un código conocido,
 *   devuelve el mensaje en español correspondiente.
 * - Si no se reconoce el código o no hay código, devuelve el mensaje default.
 * - Nunca devuelve el `message` crudo de Supabase.
 *
 * @example
 * const error = { code: "email_not_confirmed", message: "Email not confirmed" };
 * mapSupabaseAuthError(error); // "Revisá tu casilla y confirmá el correo para activar la cuenta."
 */
export function mapSupabaseAuthError(error: unknown): string {
  const code = getErrorCode(error);

  if (code && Object.hasOwn(SUPABASE_AUTH_ERROR_MESSAGES, code)) {
    return SUPABASE_AUTH_ERROR_MESSAGES[code as SupabaseAuthErrorCode];
  }

  return SUPABASE_AUTH_ERROR_MESSAGES.default;
}
