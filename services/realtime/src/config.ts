import { z } from "zod";

const EnvSchema = z.object({
  REALTIME_PORT: z.coerce.number().int().positive().default(3001),
  SUPABASE_URL: z.string().url(),
  SUPABASE_JWT_AUDIENCE: z.string().default("authenticated"),
  /**
   * Issuer del JWT emitido por Supabase GoTrue.
   *
   * **Importante**: Supabase emite tokens con `iss = ${SUPABASE_URL}/auth/v1`
   * (con el sufijo `/auth/v1`). Si este campo queda vacio, `server.ts` usa
   * ese default. Si lo definis explicitamente, debe matchear exactamente lo
   * que Supabase emite; un mismatch produce `ERR_JWT_CLAIM_VALIDATION_FAILED`
   * y rechaza TODAS las conexiones WebSocket (ver socket-auth.ts).
   *
   * Referencia: https://supabase.com/docs/guides/auth/jwts (estructura del JWT).
   */
  SUPABASE_JWT_ISSUER: z.string().url().optional(),
  DATABASE_URL: z.string().url(),
  REALTIME_INTERNAL_SECRET: z.string().min(16),
  CORS_ORIGIN: z.string().url().default("http://localhost:3000"),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
});

export type Config = z.infer<typeof EnvSchema>;

/**
 * Devuelve el `iss` esperado del JWT de Supabase.
 *
 * Regla: Supabase firma con `iss = ${SUPABASE_URL}/auth/v1`. Si el operador
 * define `SUPABASE_JWT_ISSUER` se usa ese (override explicito); si no, se
 * computa desde `SUPABASE_URL` con el sufijo `/auth/v1`.
 *
 * Centralizado en una funcion para:
 * 1. Tener un solo lugar donde se aplica la convencion de Supabase.
 * 2. Poder testearlo sin levantar el server.
 * 3. Hacer explicita la dependencia con el comportamiento de GoTrue.
 */
export function resolveJwtIssuer(config: Pick<Config, "SUPABASE_URL" | "SUPABASE_JWT_ISSUER">): string {
  return config.SUPABASE_JWT_ISSUER ?? `${config.SUPABASE_URL}/auth/v1`;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = EnvSchema.safeParse(env);
  if (!parsed.success) {
    // eslint-disable-next-line no-console
    console.error("[realtime] Invalid environment variables:", parsed.error.flatten().fieldErrors);
    throw new Error("Invalid environment variables. Ver consola para detalles.");
  }
  return parsed.data;
}
