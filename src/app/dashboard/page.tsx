import { BellRingIcon, MapPinnedIcon, ShieldCheckIcon, UsersIcon } from "lucide-react";

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

const communitySections = ["Entrada norte", "Estacionamientos", "Torre A"];

export default function DashboardPage() {
  return (
    <RouteShell
      badge="Comunidad ACTIVE"
      title="Dashboard comunitario"
      description="Resumen operativo para miembros activos: sectores, alertas internas e incidentes visibles segun rol y permisos."
      activeHref="/dashboard"
    >
      <Alert>
        <BellRingIcon />
        <AlertTitle>Sin alertas criticas activas</AlertTitle>
        <AlertDescription>
          Las alertas HIGH y CRITICAL apareceran aqui cuando el servicio realtime valide tu membresia ACTIVE.
        </AlertDescription>
      </Alert>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardDescription>Miembros activos</CardDescription>
            <CardTitle>0</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Pendiente conectar aprobacion administrativa.
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Sectores comunitarios</CardDescription>
            <CardTitle>{communitySections.length}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {communitySections.map((sector) => (
              <Badge key={sector} variant="secondary">
                {sector}
              </Badge>
            ))}
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

      <div className="grid gap-6 lg:grid-cols-2">
        <DomainEmptyState
          icon={<MapPinnedIcon />}
          title="Configura sectores comunitarios"
          description="Los sectores son opcionales, pero ayudan a notificar vecinos cercanos sin usar GPS exacto."
          action="Crear sector"
        />
        <NoPermissionState
          title="Datos comunitarios protegidos"
          description="Miembros PENDING o BLOCKED no deben ver camaras, incidentes ni evidencia de la comunidad."
        />
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
          Validar comunidad, rol, estado ACTIVE y estado de comunidad en cada consulta sensible.
        </CardContent>
      </Card>
    </RouteShell>
  );
}
