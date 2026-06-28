import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getPrisma } from "@/lib/prisma";
import { redirect } from "next/navigation";

/**
 * Homepage — Auth dispatcher.
 *
 * Server Component que redirige según autenticación y rol:
 * - Sin sesión → /login
 * - PLATFORM_ADMIN → /platform
 * - Miembro ACTIVE → /dashboard
 * - Miembro PENDING o sin membresía → /request-membership
 */
export default async function HomePage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const prisma = getPrisma();

  // Buscar usuario en base de datos local por su authProviderId (Supabase user ID)
  const dbUser = await prisma.user.findUnique({
    where: { authProviderId: user.id },
    select: { id: true, platformRole: true },
  });

  if (!dbUser) {
    // Autenticado en Supabase pero no registrado en aplicación
    redirect("/request-membership");
  }

  // Administrador de plataforma (rol global)
  if (dbUser.platformRole === "PLATFORM_ADMIN") {
    redirect("/platform");
  }

  // Verificar membresía comunitaria
  const membership = await prisma.communityMember.findUnique({
    where: { userId: dbUser.id },
    select: { status: true },
  });

  if (!membership) {
    redirect("/request-membership");
  }

  if (membership.status === "ACTIVE") {
    redirect("/dashboard");
  }

  // PENDING, BLOCKED o cualquier otro estado
  redirect("/request-membership");
}
