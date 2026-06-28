import { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Authenticates a request by checking Supabase session via cookies first,
 * then falling back to the Authorization Bearer header (useful for testing).
 *
 * Returns the authenticated user's Supabase `user` object, or `null`.
 */
export async function authenticateRequest(
  request: NextRequest,
): Promise<{ id: string } | null> {
  const cookieClient = await createSupabaseServerClient();
  const { data: cookieData } = await cookieClient.auth.getUser();
  if (cookieData?.user) {
    return { id: cookieData.user.id };
  }

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
