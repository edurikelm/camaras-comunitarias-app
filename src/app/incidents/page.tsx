import { AlertTriangleIcon, BellRingIcon, ClockIcon, ImageIcon, PlusIcon } from "lucide-react";

import { DomainEmptyState } from "@/components/domain/empty-state";
import { NoPermissionState } from "@/components/domain/no-permission-state";
import { RouteShell } from "@/components/domain/route-shell";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const incidentStatuses = ["OPEN", "REVIEWING", "CLOSED"];

export default function IncidentsPage() {
  return (
    <RouteShell
      badge="Incidentes y SOS"
      title="Incidentes, alertas y evidencia"
      description="Reporte rapido con severidad sugerida, evidencia restringida y solicitudes de grabacion manuales."
      activeHref="/incidents"
      action={
        <Button disabled>
          <PlusIcon data-icon="inline-start" />
          Proximamente: crear incidente
        </Button>
      }
    >
      <Alert variant="destructive">
        <AlertTriangleIcon />
        <AlertTitle>SOS no cambia permisos de camara</AlertTitle>
        <AlertDescription>
          En el MVP, un SOS genera alerta CRITICAL y coordinacion, pero no abre camaras cercanas automaticamente.
        </AlertDescription>
      </Alert>

      <div className="grid gap-4 md:grid-cols-3">
        {incidentStatuses.map((status) => (
          <Card key={status}>
            <CardHeader>
              <CardDescription>Estado</CardDescription>
              <CardTitle>{status}</CardTitle>
            </CardHeader>
            <CardContent className="text-sm leading-6 text-muted-foreground">
              {status === "CLOSED"
                ? "No admite nuevas solicitudes por defecto; reapertura solo ADMIN/GUARD con motivo."
                : "Permite seguimiento operativo segun rol y permisos."}
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
        <DomainEmptyState
          icon={<BellRingIcon />}
          title="No hay incidentes abiertos"
          description="Cuando un vecino reporte un evento, se sugerira severidad y se notificara segun sector comunitario y rol."
          action="Reportar incidente"
        />

        <Card>
          <CardHeader>
            <CardTitle>Solicitud de grabacion</CardTitle>
            <CardDescription>
              Flujo manual asociado a incidente, camara y dueno.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="flex items-start gap-3 rounded-lg border p-3">
              <ClockIcon data-icon="inline-start" />
              <p className="text-sm leading-6 text-muted-foreground">
                Maximo 30 minutos por solicitud; no se permite solicitar un dia completo.
              </p>
            </div>
            <div className="flex items-start gap-3 rounded-lg border p-3">
              <ImageIcon data-icon="inline-start" />
              <p className="text-sm leading-6 text-muted-foreground">
                Evidencia MVP: imagenes y metadata. Vecinos notificados ven resumen, no evidencia completa por defecto.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline">PENDING</Badge>
              <Badge variant="outline">ACCEPTED</Badge>
              <Badge variant="outline">REJECTED</Badge>
            </div>
          </CardContent>
        </Card>
      </div>

      <NoPermissionState description="La visibilidad de evidencia esta restringida al creador, administradores y guardias autorizados." />
    </RouteShell>
  );
}
