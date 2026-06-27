import { NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

/**
 * Authenticates a request by checking Supabase session via cookies first,
 * then falling back to the Authorization Bearer header (useful for testing).
 *
 * Returns the authenticated user's Supabase `user` object, or `null`.
 */
export async function authenticateRequest(
  request: NextRequest,
): Promise<{ id: string } | null> {
  // 1. Try cookie-based auth (production path)
  const cookieStore = await cookies();
  const cookieClient = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options);
            });
          } catch {
            // Server Components cannot set cookies; Route Handlers can.
          }
        },
      },
    },
  );

  const { data: cookieData } = await cookieClient.auth.getUser();
  if (cookieData?.user) {
    return { id: cookieData.user.id };
  }

  // 2. Fallback: Authorization Bearer header (testing convenience)
  const authHeader = request.headers.get("authorization");
  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice(7);

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        global: { headers: { Authorization: `Bearer ${token}` } },
      },
    );

    const { data: bearerData } = await supabase.auth.getUser();
    if (bearerData?.user) {
      return { id: bearerData.user.id };
    }
  }

  return null;
}
