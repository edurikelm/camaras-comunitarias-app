"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertCircleIcon, CheckCircleIcon, Loader2Icon } from "lucide-react";
import { z } from "zod";

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
import { mapSupabaseAuthError } from "@/lib/api/supabase-auth-error-mapper";

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

const registerSchema = z.object({
  name: z
    .string()
    .min(2, "El nombre debe tener al menos 2 caracteres")
    .max(100, "El nombre no puede exceder 100 caracteres"),
  email: z.string().email("Dirección de correo inválida"),
  password: z
    .string()
    .min(6, "La contraseña debe tener al menos 6 caracteres")
    .max(100, "La contraseña no puede exceder 100 caracteres"),
});

export default function RegisterPage() {
  const supabase = useSupabase();
  const router = useRouter();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  /** true cuando signUp succeeded pero requiere confirmación de email (session === null) */
  const [emailConfirmation, setEmailConfirmation] = useState(false);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setError(null);
      setEmailConfirmation(false);
      setLoading(true);

      // 0. Validate inputs before any side-effect
      const parsed = registerSchema.safeParse({ name, email, password });
      if (!parsed.success) {
        setError(parsed.error.errors[0].message);
        setLoading(false);
        return;
      }

      // 1. Create user in Supabase Auth
      const { data: signUpData, error: signUpError } =
        await supabase.auth.signUp({
          email,
          password,
        });

      if (signUpError) {
        setError(mapSupabaseAuthError(signUpError));
        setLoading(false);
        return;
      }

      const authUserId = signUpData.user?.id;
      if (!authUserId) {
        setError("No se pudo crear la cuenta. Intentalo de nuevo.");
        setLoading(false);
        return;
      }

      // 2. Create User record in local database via our API
      try {
        const response = await fetch("/api/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, authUserId, email }),
        });

        if (!response.ok) {
          // Edge case: signUp succeeded in Supabase Auth but local DB record failed.
          // The auth account exists; we surface a clear message rather than masking the partial state.
          const body = await response.json();
          setError(
            body.error ||
              "Tu cuenta fue creada en Supabase pero hubo un error creando tu perfil local. Contactá soporte.",
          );
          setLoading(false);
          return;
        }

        // 3a. Auto-confirm enabled in Supabase → session already active → dispatch to auth dispatcher
        if (signUpData.session) {
          setLoading(false);
          router.push("/");
          router.refresh();
          return;
        }

        // 3b. Email confirmation required → stay on page with clear next-step messaging
        setEmailConfirmation(true);
        setLoading(false);
      } catch {
        setError("Error de conexión. Intentalo de nuevo.");
        setLoading(false);
      }
    },
    [supabase, email, password, name, router],
  );

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">Crear cuenta</CardTitle>
          <CardDescription>
            Registrate para acceder a la plataforma de seguridad comunitaria
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            {error && (
              <Alert variant="destructive">
                <AlertCircleIcon />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            {emailConfirmation && (
              <Alert variant="default">
                <CheckCircleIcon className="text-green-600" />
                <AlertDescription>
                  Cuenta creada correctamente. Revisá tu casilla y confirmá el
                  correo para activar la cuenta.
                </AlertDescription>
              </Alert>
            )}

            <div className="flex flex-col gap-2">
              <Label htmlFor="name">Nombre</Label>
              <Input
                id="name"
                type="text"
                placeholder="Tu nombre"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                autoComplete="name"
              />
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="email">Correo electrónico</Label>
              <Input
                id="email"
                type="email"
                placeholder="tu@correo.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
              />
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="password">Contraseña</Label>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                autoComplete="new-password"
              />
            </div>

            <Button type="submit" disabled={loading || emailConfirmation}>
              {loading && <Loader2Icon className="animate-spin" />}
              {loading ? "Creando cuenta…" : "Crear cuenta"}
            </Button>

            <p className="text-center text-sm text-muted-foreground">
              ¿Ya tenés cuenta?{" "}
              <Link
                href="/login"
                className="underline underline-offset-4 hover:text-primary"
              >
                Iniciá sesión
              </Link>
            </p>

            <p className="text-center text-sm text-muted-foreground">
              <Link href="/" className="underline-offset-4 hover:underline">
                Volver al inicio
              </Link>
            </p>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
