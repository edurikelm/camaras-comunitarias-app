import {
  AlertTriangleIcon,
  BellRingIcon,
  CameraIcon,
  CheckCircle2Icon,
  ClockIcon,
  ShieldCheckIcon,
  UsersIcon,
} from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

const communityStats = [
  {
    label: "Miembros activos",
    value: "128",
    helper: "Vecinos, administradores y guardias",
  },
  {
    label: "Camaras autorizadas",
    value: "24",
    helper: "Con permisos explicitos del dueno",
  },
  {
    label: "Incidentes abiertos",
    value: "3",
    helper: "Priorizados por severidad",
  },
];

const tracerSteps = [
  "Comunidad creada por plataforma",
  "Invitacion y aprobacion de vecino",
  "Camara revisada por administrador",
  "Permiso explicito para live view",
  "Incidente con alerta interna",
  "Solicitud de grabacion manual",
];

export default function Home() {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <section className="mx-auto flex min-h-screen w-full max-w-7xl flex-col gap-8 px-6 py-8 lg:px-8">
        <header className="flex flex-col gap-6 rounded-2xl border bg-card p-6 text-card-foreground shadow-sm lg:flex-row lg:items-center lg:justify-between">
          <div className="flex max-w-3xl flex-col gap-4">
            <Badge variant="secondary" className="w-fit">
              MVP tracer bullet
            </Badge>
            <div className="flex flex-col gap-3">
              <h1 className="text-4xl font-semibold tracking-tight sm:text-6xl">
                Camaras Comunitarias
              </h1>
              <p className="text-lg leading-8 text-muted-foreground">
                Red privada de seguridad comunitaria para compartir camaras,
                reportar incidentes y coordinar alertas bajo permisos controlados.
              </p>
            </div>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row lg:flex-col">
            <Button disabled>
              <ShieldCheckIcon data-icon="inline-start" />
              Proximamente: comunidad
            </Button>
            <Button variant="outline" disabled>
              <CameraIcon data-icon="inline-start" />
              Proximamente: camaras
            </Button>
          </div>
        </header>

        <div className="grid gap-4 md:grid-cols-3">
          {communityStats.map((stat) => (
            <Card key={stat.label}>
              <CardHeader>
                <CardDescription>{stat.label}</CardDescription>
                <CardTitle className="text-3xl">{stat.value}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">{stat.helper}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="grid gap-6 lg:grid-cols-[1.6fr_1fr]">
          <Card>
            <CardHeader>
              <CardTitle>Panel operativo comunitario</CardTitle>
              <CardDescription>
                Vista base para validar comunidad, camaras, incidentes y alertas internas.
              </CardDescription>
              <CardAction>
                <Badge variant="outline">Demo UI</Badge>
              </CardAction>
            </CardHeader>
            <CardContent className="flex flex-col gap-5">
              <Alert>
                <BellRingIcon />
                <AlertTitle>Alerta interna preparada</AlertTitle>
                <AlertDescription>
                  Socket.IO notificara por comunidad, sector y rol cuando existan flujos reales.
                </AlertDescription>
              </Alert>

              <div className="grid gap-4 md:grid-cols-2">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-base">
                      <CameraIcon data-icon="inline-start" />
                      Camara entrada norte
                    </CardTitle>
                    <CardDescription>ACTIVE · Permiso explicito</CardDescription>
                  </CardHeader>
                  <CardContent className="flex flex-col gap-3">
                    <div className="aspect-video rounded-lg border bg-muted" />
                    <div className="flex items-center justify-between gap-3">
                      <Badge variant="secondary">WebRTC autorizado</Badge>
                      <Button size="sm" variant="outline" disabled>
                        Proximamente
                      </Button>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-base">
                      <AlertTriangleIcon data-icon="inline-start" />
                      Incidente en revision
                    </CardTitle>
                    <CardDescription>Persona sospechosa · Severidad MEDIUM</CardDescription>
                  </CardHeader>
                  <CardContent className="flex flex-col gap-4">
                    <p className="text-sm leading-6 text-muted-foreground">
                      Resumen visible para vecinos notificados. Evidencia completa restringida a creador, admin y guardia.
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <Badge variant="outline">Sector: Entrada norte</Badge>
                      <Badge variant="secondary">REVIEWING</Badge>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Tracer bullet MVP</CardTitle>
              <CardDescription>
                Secuencia que debe funcionar de punta a punta antes de ampliar alcance.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              {tracerSteps.map((step, index) => (
                <div key={step} className="flex gap-3">
                  <Badge variant="outline" className="size-7 rounded-full p-0">
                    {index + 1}
                  </Badge>
                  <div className="flex flex-1 flex-col gap-3">
                    <div className="flex items-start gap-2">
                      <CheckCircle2Icon data-icon="inline-start" className="mt-0.5 text-muted-foreground" />
                      <p className="text-sm font-medium leading-6">{step}</p>
                    </div>
                    {index < tracerSteps.length - 1 ? <Separator /> : null}
                  </div>
                </div>
              ))}

              <Separator />

              <div className="flex flex-col gap-3 rounded-lg bg-muted p-4">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <ClockIcon data-icon="inline-start" />
                  Pendiente siguiente
                </div>
                <p className="text-sm leading-6 text-muted-foreground">
                  Implementar auth, permisos y servicios de dominio antes de conectar datos reales.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>

        <footer className="flex flex-col gap-2 pb-4 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <span>Privacidad primero · Multi-tenant · Auditoria sensible</span>
          <span className="flex items-center gap-2">
            <UsersIcon data-icon="inline-start" />
            Vecino · Administrador · Guardia
          </span>
        </footer>
      </section>
    </main>
  );
}
