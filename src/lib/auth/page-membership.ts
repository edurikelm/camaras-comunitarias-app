/**
 * Helper compartido de membresía para páginas autenticadas.
 *
 * Distingue 6 estados explícitos para manejar correctamente los mensajes
 * de permiso según el estado del miembro: sin sesión, sin usuario en BD,
 * sin membresía, o con membresía en estado PENDING / BLOCKED / ACTIVE.
 *
 * También expone `ViewerRole` para que el nav pueda filtrar secciones
 * según el rol del usuario autenticado (evita mostrar "Plataforma"
 * a usuarios que no son PLATFORM_ADMIN).
 */

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getPrisma } from "@/lib/prisma";
import type { CommunityMemberRole, PlatformRole } from "@/generated/prisma/client";

// ─── Tipos públicos ───────────────────────────────────────────────────────────

/**
 * Rol del miembro para filtrar UI (nav, permisos condicionales).
 * PLATFORM_ADMIN es un rol global, los demás son roles de comunidad.
 */
export type ViewerRole = "PLATFORM_ADMIN" | "ADMIN" | "GUARD" | "NEIGHBOR";

export type MembershipKind =
  | "no-session"
  | "no-db-user"
  | "no-membership"
  | "PENDING"
  | "BLOCKED"
  | "ACTIVE";

/**
 * Discriminated union con 6 estados.
 * Cada variant incluye la información necesaria para renderizar
 * el mensaje de permiso o el contenido de la página.
 */
export type PageMembership =
  | { kind: "no-session" }
  | { kind: "no-db-user" }
  | { kind: "no-membership"; platformRole: "PLATFORM_ADMIN" | null }
  | {
      kind: "PENDING";
      userId: string;
      platformRole: ViewerRole | null;
      communityId: string;
      role: Exclude<ViewerRole, "PLATFORM_ADMIN">;
    }
  | {
      kind: "BLOCKED";
      userId: string;
      platformRole: ViewerRole | null;
      communityId: string;
      role: Exclude<ViewerRole, "PLATFORM_ADMIN">;
    }
  | {
      kind: "ACTIVE";
      userId: string;
      platformRole: ViewerRole | null;
      communityId: string;
      role: Exclude<ViewerRole, "PLATFORM_ADMIN">;
    };

// ─── Implementación ───────────────────────────────────────────────────────────

/**
 * Obtiene el estado de membresía del usuario autenticado en la página actual.
 *
 * Flujo:
 * 1. Sin sesión en Supabase → kind: "no-session"
 * 2. Sesión pero no existe en la tabla User → kind: "no-db-user"
 * 3. Usuario existe pero no tiene CommunityMember → kind: "no-membership"
 *    (puede tener platformRole PLATFORM_ADMIN o null)
 * 4. CommunityMember existe → kind según status: PENDING | BLOCKED | ACTIVE
 *
 * En los estados PENDING / BLOCKED / ACTIVE se incluye communityId, role
 * y platformRole para lógica condicional en la página.
 */
export async function getPageMembership(): Promise<PageMembership> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { kind: "no-session" };
  }

  const prisma = getPrisma();

  const dbUser = await prisma.user.findUnique({
    where: { authProviderId: user.id },
    select: { id: true, platformRole: true },
  });

  if (!dbUser) {
    return { kind: "no-db-user" };
  }

  const membership = await prisma.communityMember.findUnique({
    where: { userId: dbUser.id },
    select: {
      communityId: true,
      role: true,
      status: true,
    },
  });

  if (!membership) {
    // Puede ser PLATFORM_ADMIN sin membresía comunitaria
    return { kind: "no-membership", platformRole: dbUser.platformRole ?? null };
  }

  // Mapear CommunityMemberRole (Prisma) → ViewerRole
  const viewerRole = mapToViewerRole(dbUser.platformRole ?? null, membership.role);

  // Estado del miembro: PENDING | BLOCKED | ACTIVE
  if (membership.status === "PENDING") {
    return {
      kind: "PENDING",
      userId: dbUser.id,
      platformRole: viewerRole,
      communityId: membership.communityId,
      role: membership.role,
    };
  }

  if (membership.status === "BLOCKED") {
    return {
      kind: "BLOCKED",
      userId: dbUser.id,
      platformRole: viewerRole,
      communityId: membership.communityId,
      role: membership.role,
    };
  }

  // ACTIVE
  return {
    kind: "ACTIVE",
    userId: dbUser.id,
    platformRole: viewerRole,
    communityId: membership.communityId,
    role: membership.role,
  };
}

/**
 * Mapea PlatformRole (opcional) + CommunityMemberRole (obligatorio en contexto comunitario)
 * al tipo ViewerRole unificado.
 *
 * Un PLATFORM_ADMIN puede tener communityRole = ADMIN/GUARD/NEIGHBOR si también
 * es miembro de una comunidad, pero el rol global prevalece para ciertas
 * decisiones de UI (como mostrar "Plataforma" en el nav).
 */
function mapToViewerRole(
  platformRole: PlatformRole | null,
  communityRole: CommunityMemberRole,
): ViewerRole {
  if (platformRole === "PLATFORM_ADMIN") {
    return "PLATFORM_ADMIN";
  }
  // communityRole solo puede ser NEIGHBOR | ADMIN | GUARD
  return communityRole;
}
