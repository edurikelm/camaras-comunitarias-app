import { createClient } from "@supabase/supabase-js";

/**
 * Returns a Supabase admin client using the service_role key.
 *
 * This client bypasses RLS and should ONLY be used in server-side code
 * (API routes, server actions, domain service infrastructure).
 */
let cachedAdmin: ReturnType<typeof createClient> | undefined;

export function getSupabaseAdmin() {
  if (cachedAdmin) return cachedAdmin;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL is not configured");
  }
  if (!serviceRoleKey) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY is not configured. " +
        "Set it in your environment (e.g. .env.local) to enable storage operations.",
    );
  }

  cachedAdmin = createClient(url, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  return cachedAdmin;
}
