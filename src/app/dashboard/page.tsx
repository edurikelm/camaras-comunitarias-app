import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getPrisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import {
  BellRingIcon,
  CameraIcon,
  MapPinnedIcon,
  ShieldCheckIcon,
  UsersIcon,
} from "lucide-react";

import { CreateInvitationDialog } from "@/components/community/create-invitation-dialog";
import { MemberApprovalList } from "@/components/community/member-approval-list";
import { DomainEmptyState } from "@/components/domain/empty-state";
import { NoPermissionState } from "@/components/domain/no-permission-state";
import { RouteShell } from "@/components/domain/route-shell";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default async function DashboardPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const prisma = getPrisma();

  // Buscar usuario en base de datos local
  const dbUser = await prisma.user.findUnique({
    where: { authProviderId: user.id },
    select: { id: true },
  });

  if (!dbUser) {
    redirect("/request-membership");
  }

  // Buscar membresia
  const membership = await prisma.communityMember.findUnique({
    where: { userId: dbUser.id },
    include: { community: true },
  });

  // Sin membresia o PENDING
  if (!membership || membership.status === "PENDING") {
    return (
      <RouteShell
        badge="Invitacion pendiente"
        title="Membresia pendiente"
        description="Tu solicitud de membresia esta pendiente de aprobacion por un administrador."
        activeHref="/dashboard"
      >
        <DomainEmptyState
          icon={<UsersIcon />}
          title="Esperando aprobacion"
          description="Un administrador debe aprobar tu solicitud antes de que puedas acceder a los datos de la comunidad."
        />
      </RouteShell>
    );
  }

  // BLOCKED
  if (membership.status === "BLOCKED") {
    redirect("/request-membership");
  }

  // ACTIVE — consultar datos reales
  const community = membership.community;
  const isAdmin = membership.role === "ADMIN";

  const [sectors, activeMembersCount, userCameras, pendingMembers] =
    await Promise.all([
      prisma.communitySector.findMany({
        where: { communityId: community.id },
        orderBy: { name: "asc" },
      }),
      prisma.communityMember.count({
        where: { communityId: community.id, status: "ACTIVE" },
      }),
      prisma.camera.findMany({
        where: { ownerId: dbUser.id, communityId: community.id },
        include: { permissions: true },
        orderBy: { createdAt: "desc" },
      }),
      isAdmin
        ? prisma.communityMember.findMany({
            where: {
              communityId: community.id,
              status: "PENDING",
            },
            include: {
              user: {
                select: { name: true, email: true },
              },
            },
            orderBy: { createdAt: "asc" },
          })
        : Promise.resolve([]),
    ]);

  const hasCameras = userCameras.length > 0;

  return (
    <RouteShell
      badge={`Comunidad ${community.status}`}
      title={community.name}
      description="Resumen operativo para miembros activos: sectores, alertas internas e incidentes visibles segun rol y permisos."
      activeHref="/dashboard"
      action={
        isAdmin ? (
          <CreateInvitationDialog communityId={community.id} />
        ) : undefined
      }
    >
      <Alert>
        <BellRingIcon />
        <AlertTitle>Sin alertas criticas activas</AlertTitle>
        <AlertDescription>
          Las alertas HIGH y CRITICAL apareceran aqui cuando el servicio
          realtime valide tu membresia ACTIVE.
        </AlertDescription>
      </Alert>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardDescription>Miembros activos</CardDescription>
            <CardTitle>{activeMembersCount}</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            {activeMembersCount <= 1
              ? "Eres el unico miembro activo de esta comunidad."
              : `${activeMembersCount} miembros con estado ACTIVE.`}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Sectores comunitarios</CardDescription>
            <CardTitle>{sectors.length}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {sectors.length > 0 ? (
              sectors.map((sector) => (
                <Badge key={sector.id} variant="secondary">
                  {sector.name}
                </Badge>
              ))
            ) : (
              <span className="text-sm text-muted-foreground">
                Sin sectores configurados
              </span>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Estado de privacidad</CardDescription>
            <CardTitle>Restringido</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Evidencia y video requieren permisos explicitos.
          </CardContent>
        </Card>
      </div>

      {isAdmin && pendingMembers.length > 0 && (
        <MemberApprovalList
          communityId={community.id}
          pendingMembers={pendingMembers.map((m) => ({
            id: m.id,
            userId: m.userId,
            user: m.user,
            createdAt: m.createdAt.toISOString(),
          }))}
        />
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <DomainEmptyState
          icon={<MapPinnedIcon />}
          title="Configura sectores comunitarios"
          description="Los sectores son opcionales, pero ayudan a notificar vecinos cercanos sin usar GPS exacto."
          action="Crear sector"
        />
        {hasCameras ? (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CameraIcon data-icon="inline-start" />
                Tus camaras ({userCameras.length})
              </CardTitle>
              <CardDescription>
                Camaras registradas por ti en esta comunidad.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              {userCameras.map((camera) => (
                <div
                  key={camera.id}
                  className="flex items-center justify-between rounded-lg border p-3"
                >
                  <div className="flex flex-col">
                    <span className="font-medium">{camera.name}</span>
                    <span className="text-sm text-muted-foreground">
                      {camera.status === "ACTIVE"
                        ? "Activa"
                        : camera.status === "PENDING_REVIEW"
                          ? "Pendiente de revision"
                          : camera.status === "REJECTED"
                            ? "Rechazada"
                            : camera.status === "INACTIVE"
                              ? "Inactiva"
                              : "Privada"}
                    </span>
                  </div>
                  <Badge
                    variant={
                      camera.status === "ACTIVE" ? "default" : "secondary"
                    }
                  >
                    {camera.permissions.length} permisos
                  </Badge>
                </div>
              ))}
            </CardContent>
          </Card>
        ) : (
          <DomainEmptyState
            icon={<CameraIcon />}
            title="Registra tu primera camara"
            description="Comparte una camara con tu comunidad para mejorar la seguridad del vecindario."
            action="Registrar camara"
          />
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheckIcon data-icon="inline-start" />
            Proximo paso operativo
          </CardTitle>
          <CardDescription>
            Implementar servicios de dominio antes de conectar datos reales.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex items-center gap-2 text-sm text-muted-foreground">
          <UsersIcon data-icon="inline-start" />
          Validar comunidad, rol, estado ACTIVE y estado de comunidad en cada
          consulta sensible.
        </CardContent>
      </Card>
    </RouteShell>
  );
}
