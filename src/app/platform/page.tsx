import { Building2Icon, ShieldCheckIcon, UsersIcon } from "lucide-react";
import { redirect } from "next/navigation";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getPrisma } from "@/lib/prisma";
import { CreateCommunityDialog } from "@/components/platform/create-community-dialog";
import { DomainEmptyState } from "@/components/domain/empty-state";
import { NoPermissionState } from "@/components/domain/no-permission-state";
import { RouteShell } from "@/components/domain/route-shell";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default async function PlatformPage() {
  // 1. Authenticate
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // 2. Check PLATFORM_ADMIN role
  const prisma = getPrisma();
  const dbUser = await prisma.user.findUnique({
    where: { authProviderId: user.id },
    select: { platformRole: true },
  });

  if (!dbUser || dbUser.platformRole !== "PLATFORM_ADMIN") {
    return (
      <RouteShell
        badge="PLATFORM_ADMIN"
        title="Panel de plataforma"
        description="Gestiona comunidades y primeros administradores."
        activeHref="/platform"
      >
        <NoPermissionState description="No tienes permisos de administrador de plataforma." />
      </RouteShell>
    );
  }

  // 3. Fetch real platform data
  const [communities, adminCount] = await Promise.all([
    prisma.community.findMany({
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        address: true,
        status: true,
        createdAt: true,
        _count: { select: { members: true } },
      },
    }),
    prisma.communityMember.count({
      where: { role: "ADMIN" },
    }),
  ]);

  const activeCommunitiesCount = communities.filter(
    (c) => c.status === "ACTIVE",
  ).length;

  const platformCards = [
    {
      title: "Comunidades activas",
      value: String(activeCommunitiesCount),
      description: "Tenants operativos creados por plataforma.",
    },
    {
      title: "Administradores",
      value: String(adminCount),
      description: "Administradores registrados en todas las comunidades.",
    },
    {
      title: "Soporte excepcional",
      value: "Auditado",
      description:
        "Sin acceso privado por defecto a video, evidencia o incidentes.",
    },
  ];

  return (
    <RouteShell
      badge="PLATFORM_ADMIN"
      title="Panel de plataforma"
      description="Gestiona comunidades y primeros administradores sin acceder por defecto a datos privados del tenant."
      activeHref="/platform"
      action={<CreateCommunityDialog />}
    >
      <div className="grid gap-4 md:grid-cols-3">
        {platformCards.map((card) => (
          <Card key={card.title}>
            <CardHeader>
              <CardDescription>{card.title}</CardDescription>
              <CardTitle>{card.value}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm leading-6 text-muted-foreground">
                {card.description}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        {communities.length === 0 ? (
          <DomainEmptyState
            icon={<Building2Icon />}
            title="Aun no hay comunidades creadas"
            description="El primer paso del tracer bullet es crear una comunidad y asignar su primer administrador activo."
            action="Crear primera comunidad"
          />
        ) : (
          <div className="flex flex-col gap-4">
            <h2 className="text-lg font-semibold">
              Comunidades ({communities.length})
            </h2>
            <div className="flex flex-col gap-3">
              {communities.map((community) => (
                <Card key={community.id}>
                  <CardHeader>
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex flex-col gap-1">
                        <CardTitle className="text-base">
                          {community.name}
                        </CardTitle>
                        {community.address ? (
                          <CardDescription>
                            {community.address}
                          </CardDescription>
                        ) : null}
                      </div>
                      <Badge
                        variant={
                          community.status === "ACTIVE"
                            ? "default"
                            : "secondary"
                        }
                      >
                        {community.status}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground">
                      {community._count.members} miembro
                      {community._count.members !== 1 ? "s" : ""}
                    </p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Reglas de acceso plataforma</CardTitle>
            <CardDescription>
              Capacidades globales separadas de los roles comunitarios.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <div className="flex items-start gap-3 rounded-lg border p-3">
              <ShieldCheckIcon data-icon="inline-start" />
              <p className="text-sm leading-6 text-muted-foreground">
                Plataforma crea comunidades y define primer ADMIN; no ve video ni
                evidencia por defecto.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <UsersIcon data-icon="inline-start" />
              <Badge variant="outline">Rol global separado</Badge>
            </div>
          </CardContent>
        </Card>
      </div>
    </RouteShell>
  );
}
