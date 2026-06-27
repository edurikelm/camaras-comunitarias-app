import { CameraIcon, EyeIcon, LockKeyholeIcon, PlusIcon, ShieldCheckIcon } from "lucide-react";

import { DomainEmptyState } from "@/components/domain/empty-state";
import { NoPermissionState } from "@/components/domain/no-permission-state";
import { RouteShell } from "@/components/domain/route-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export default function CamerasPage() {
  return (
    <RouteShell
      badge="Camara comunitaria"
      title="Camaras y permisos"
      description="Registro, revision administrativa y acceso live view siempre mediado por permisos explicitos del dueno."
      activeHref="/cameras"
      action={
        <Button disabled>
          <PlusIcon data-icon="inline-start" />
          Proximamente: registrar camara
        </Button>
      }
    >
      <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        <Card>
          <CardHeader>
            <CardTitle>Live view autorizado</CardTitle>
            <CardDescription>
              Placeholder de stream WebRTC. RTSP y streamKey nunca deben exponerse al frontend.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="relative aspect-video overflow-hidden rounded-xl border bg-muted">
              <Skeleton className="size-full rounded-none" />
              <div className="absolute inset-x-4 bottom-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-background/95 p-3 shadow-sm">
                <div className="flex items-center gap-2">
                  <CameraIcon data-icon="inline-start" />
                  <span className="text-sm font-medium">Entrada norte</span>
                </div>
                <Badge variant="secondary">Camara no disponible</Badge>
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <Badge variant="outline">PENDING_REVIEW</Badge>
              <Badge variant="outline">ACTIVE</Badge>
              <Badge variant="outline">PRIVATE</Badge>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Controles obligatorios</CardTitle>
            <CardDescription>
              Aprobacion administrativa no equivale a permiso de visualizacion.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 text-sm text-muted-foreground">
            <div className="flex gap-3 rounded-lg border p-3">
              <ShieldCheckIcon data-icon="inline-start" />
              <span>Validar comunidad, rol, horario, estado y permiso explicito.</span>
            </div>
            <div className="flex gap-3 rounded-lg border p-3">
              <LockKeyholeIcon data-icon="inline-start" />
              <span>RTSP cifrado/protegido y visible solo como estado tecnico resumido.</span>
            </div>
            <div className="flex gap-3 rounded-lg border p-3">
              <EyeIcon data-icon="inline-start" />
              <span>Visualizacion live view debe generar auditoria.</span>
            </div>
          </CardContent>
        </Card>
      </div>

      <DomainEmptyState
        icon={<CameraIcon />}
        title="Aun no hay camaras registradas"
        description="El vecino registra una camara, el administrador revisa datos no sensibles y el dueno configura permisos explicitos."
        action="Registrar primera camara"
      />

      <NoPermissionState description="Un ADMIN no tiene acceso automatico a todas las camaras; tambien requiere permiso explicito o flujo aceptado." />
    </RouteShell>
  );
}
