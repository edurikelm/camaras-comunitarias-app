import { redirect } from "next/navigation";
import {
  AlertTriangleIcon,
  BellRingIcon,
  ClockIcon,
  ImageIcon,
} from "lucide-react";

import { CreateIncidentDialog } from "@/components/incidents/create-incident-dialog";
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
import { getPageMembership } from "@/lib/auth/page-membership";
import { getPrisma } from "@/lib/prisma";

const incidentStatusLabels: Record<string, string> = {
  OPEN: "Abierto",
  REVIEWING: "En revision",
  CLOSED: "Cerrado",
};

const severityVariant: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  CRITICAL: "destructive",
  HIGH: "default",
  MEDIUM: "secondary",
  LOW: "outline",
};

const typeLabels: Record<string, string> = {
  THEFT: "Robo",
  SUSPICIOUS_PERSON: "Persona sospechosa",
  SUSPICIOUS_VEHICLE: "Vehículo sospechoso",
  EMERGENCY: "Emergencia",
  ACCIDENT: "Accidente",
  OTHER: "Otro",
};

export default async function IncidentsPage() {
  const session = await getPageMembership();

  switch (session.kind) {
    case "no-session":
      redirect("/login");

    case "no-db-user":
    case "no-membership":
      return (
        <RouteShell
          badge="Sin membresia"
          title="Incidentes, alertas y evidencia"
          description="Reporte rapido con severidad sugerida, evidencia restringida y solicitudes de grabacion manuales."
          activeHref="/incidents"
          viewerRole={session.kind === "no-membership" ? session.platformRole : null}
        >
          <NoPermissionState
            title="Membresia requerida"
            description="Necesitas ser miembro activo de una comunidad para acceder a los incidentes."
          />
        </RouteShell>
      );

    case "PENDING":
      return (
        <RouteShell
          badge="Membresia pendiente"
          title="Incidentes, alertas y evidencia"
          description="Reporte rapido con severidad sugerida, evidencia restringida y solicitudes de grabacion manuales."
          activeHref="/incidents"
          viewerRole={session.platformRole}
        >
          <NoPermissionState
            title="Membresia pendiente de aprobacion"
            description="Un administrador debe aprobar tu solicitud antes de que puedas crear o ver incidentes."
          />
        </RouteShell>
      );

    case "BLOCKED":
      return (
        <RouteShell
          badge="Membresia bloqueada"
          title="Incidentes, alertas y evidencia"
          description="Reporte rapido con severidad sugerida, evidencia restringida y solicitudes de grabacion manuales."
          activeHref="/incidents"
          viewerRole={session.platformRole}
        >
          <NoPermissionState
            title="Membresia bloqueada"
            description="Tu acceso a incidentes fue revocado. Contacta a un administrador si creés que es un error."
          />
        </RouteShell>
      );

    case "ACTIVE":
      // Continuar al render normal con los datos de la comunidad
      break;
  }

  // ACTIVE — fetch data
  const prisma = getPrisma();
  const communityId = session.communityId;

  const [incidents, sectors] = await Promise.all([
    prisma.incident.findMany({
      where: { communityId },
      include: {
        createdBy: { select: { name: true, email: true } },
        sector: { select: { name: true } },
        _count: { select: { evidence: true, comments: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.communitySector.findMany({
      where: { communityId },
      orderBy: { name: "asc" },
    }),
  ]);

  return (
    <RouteShell
      badge="Incidentes y SOS"
      title="Incidentes, alertas y evidencia"
      description="Reporte rapido con severidad sugerida, evidencia restringida y solicitudes de grabacion manuales."
      activeHref="/incidents"
      viewerRole={session.role}
      action={
        <CreateIncidentDialog
          communityId={communityId}
          sectors={sectors.map((s) => ({ id: s.id, name: s.name }))}
        />
      }
    >
      <Alert variant="destructive">
        <AlertTriangleIcon />
        <AlertTitle>SOS no cambia permisos de camara</AlertTitle>
        <AlertDescription>
          En el MVP, un SOS genera alerta CRITICAL y coordinacion, pero no abre
          camaras cercanas automaticamente.
        </AlertDescription>
      </Alert>

      {incidents.length === 0 ? (
        <div className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
          <DomainEmptyState
            icon={<BellRingIcon />}
            title="No hay incidentes reportados"
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
                  Maximo 30 minutos por solicitud; no se permite solicitar un
                  dia completo.
                </p>
              </div>
              <div className="flex items-start gap-3 rounded-lg border p-3">
                <ImageIcon data-icon="inline-start" />
                <p className="text-sm leading-6 text-muted-foreground">
                  Evidencia MVP: imagenes y metadata. Vecinos notificados ven
                  resumen, no evidencia completa por defecto.
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
      ) : (
        <div className="flex flex-col gap-4">
          {incidents.map((incident) => (
            <Card key={incident.id}>
              <CardHeader>
                <div className="flex items-start justify-between gap-4">
                  <div className="flex flex-col gap-1">
                    <CardTitle className="text-lg">
                      {typeLabels[incident.type] ?? incident.type}
                    </CardTitle>
                    <CardDescription>
                      {incident.createdBy.name ?? incident.createdBy.email}
                      {incident.sector
                        ? ` · ${incident.sector.name}`
                        : null}
                      {incident.location
                        ? ` · ${incident.location}`
                        : null}
                    </CardDescription>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <Badge
                      variant={
                        severityVariant[incident.severity] ?? "secondary"
                      }
                    >
                      {incident.severity}
                    </Badge>
                    <Badge variant="outline">
                      {incidentStatusLabels[incident.status] ??
                        incident.status}
                    </Badge>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                <p className="text-sm leading-6 text-muted-foreground">
                  {incident.description}
                </p>
                <div className="flex gap-3 text-xs text-muted-foreground">
                  <span>
                    {incident._count.evidence} evidencia
                    {incident._count.evidence !== 1 ? "s" : ""}
                  </span>
                  <span>
                    {incident._count.comments} comentario
                    {incident._count.comments !== 1 ? "s" : ""}
                  </span>
                  <span>
                    {new Date(incident.createdAt).toLocaleString("es-CL", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <NoPermissionState description="La visibilidad de evidencia esta restringida al creador, administradores y guardias autorizados." />
    </RouteShell>
  );
}
