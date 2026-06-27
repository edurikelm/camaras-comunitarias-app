import { Building2Icon, ShieldCheckIcon, UsersIcon } from "lucide-react";

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

const platformCards = [
  {
    title: "Comunidades activas",
    value: "0",
    description: "Tenants operativos creados por plataforma.",
  },
  {
    title: "Primeros administradores",
    value: "0",
    description: "Responsables iniciales asignados por comunidad.",
  },
  {
    title: "Soporte excepcional",
    value: "Auditado",
    description: "Sin acceso privado por defecto a video, evidencia o incidentes.",
  },
];

export default function PlatformPage() {
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
              <p className="text-sm leading-6 text-muted-foreground">{card.description}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        <DomainEmptyState
          icon={<Building2Icon />}
          title="Aun no hay comunidades creadas"
          description="El primer paso del tracer bullet es crear una comunidad y asignar su primer administrador activo."
          action="Crear primera comunidad"
        />

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
                Plataforma crea comunidades y define primer ADMIN; no ve video ni evidencia por defecto.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <UsersIcon data-icon="inline-start" />
              <Badge variant="outline">Rol global separado</Badge>
            </div>
          </CardContent>
        </Card>
      </div>

      <NoPermissionState description="Si no tienes PLATFORM_ADMIN, esta seccion debe permanecer bloqueada aunque tu sesion sea valida." />
    </RouteShell>
  );
}
