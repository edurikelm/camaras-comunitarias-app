"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { AlertCircleIcon, CheckCircle2Icon, Loader2Icon } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useSupabase } from "@/components/providers/supabase-provider";

type RequestState = "idle" | "loading" | "success" | "error";

export default function RequestMembershipPage() {
  const supabase = useSupabase();

  const [code, setCode] = useState("");
  const [state, setState] = useState<RequestState>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setErrorMessage(null);

      const trimmedCode = code.trim();

      if (!trimmedCode) {
        setErrorMessage("El código de invitación no puede estar vacío.");
        setState("error");
        return;
      }

      setState("loading");

      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        setErrorMessage("Debés iniciar sesión para solicitar membresía.");
        setState("error");
        return;
      }

      try {
        const response = await fetch("/api/community-membership/request", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code: trimmedCode }),
        });

        if (response.ok) {
          setState("success");
          return;
        }

        const body = await response.json().catch(() => ({}));
        setErrorMessage(
          body.error || "Ocurrió un error inesperado. Intentá de nuevo.",
        );
        setState("error");
      } catch {
        setErrorMessage("Error de conexión. Verificá tu conexión e intentá de nuevo.");
        setState("error");
      }
    },
    [code, supabase],
  );

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">Solicitar membresía</CardTitle>
          <CardDescription>
            Ingresá el código de invitación para unirte a una comunidad
          </CardDescription>
        </CardHeader>
        <CardContent>
          {state === "success" ? (
            <div className="flex flex-col gap-4">
              <Alert
                variant="default"
                className="border-green-500 bg-green-50 text-green-800"
              >
                <CheckCircle2Icon className="text-green-600" />
                <AlertDescription>
                  Solicitud enviada. Pendiente de aprobación por un
                  administrador.
                </AlertDescription>
              </Alert>
              <Button asChild variant="outline" className="w-full">
                <Link href="/dashboard">Ir al panel</Link>
              </Button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              {state === "error" && errorMessage && (
                <Alert variant="destructive">
                  <AlertCircleIcon />
                  <AlertDescription>{errorMessage}</AlertDescription>
                </Alert>
              )}

              <div className="flex flex-col gap-2">
                <Label htmlFor="code">Código de invitación</Label>
                <Input
                  id="code"
                  placeholder="Ingresá el código"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  required
                  autoComplete="off"
                  disabled={state === "loading"}
                />
              </div>

              <Button type="submit" disabled={state === "loading"}>
                {state === "loading" && (
                  <Loader2Icon className="animate-spin" />
                )}
                {state === "loading" ? "Enviando…" : "Solicitar ingreso"}
              </Button>

              <p className="text-center text-sm text-muted-foreground">
                <Link
                  href="/"
                  className="underline-offset-4 hover:underline"
                >
                  Volver al inicio
                </Link>
              </p>
            </form>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
