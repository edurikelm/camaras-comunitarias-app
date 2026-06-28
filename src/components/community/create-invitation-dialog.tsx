"use client";

import { useState } from "react";
import { CheckIcon, CopyIcon, PlusIcon, Share2Icon } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

type CreateInvitationDialogProps = {
  communityId: string;
};

export function CreateInvitationDialog({
  communityId,
}: CreateInvitationDialogProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [plainCode, setPlainCode] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function handleCreate() {
    setLoading(true);
    setError(null);
    setPlainCode(null);

    try {
      const res = await fetch(
        `/api/communities/${communityId}/invitations`,
        { method: "POST" },
      );

      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? "Error al crear invitacion");
      }

      const json = await res.json();
      setPlainCode(json.data.plainCode);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Error inesperado",
      );
    } finally {
      setLoading(false);
    }
  }

  async function handleCopy() {
    if (!plainCode) return;
    try {
      await navigator.clipboard.writeText(plainCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback: seleccionar el texto manualmente
    }
  }

  function handleOpenChange(newOpen: boolean) {
    if (!newOpen) {
      // Reset state when dialog closes
      setTimeout(() => {
        setPlainCode(null);
        setError(null);
        setCopied(false);
      }, 200);
    }
    setOpen(newOpen);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline" className="gap-2">
          <PlusIcon />
          Crear invitacion
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Crear invitacion</DialogTitle>
          <DialogDescription>
            Genera un codigo de invitacion para compartir con nuevos miembros.
            Cada codigo permite una unica solicitud de ingreso.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4 py-4">
          {error && (
            <div className="rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {error}
            </div>
          )}

          {plainCode ? (
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-2 rounded-md border bg-muted px-4 py-3">
                <code className="flex-1 select-all font-mono text-sm break-all">
                  {plainCode}
                </code>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={handleCopy}
                  aria-label={copied ? "Copiado" : "Copiar codigo"}
                >
                  {copied ? <CheckIcon /> : <CopyIcon />}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Comparte este codigo con la persona que quieras invitar.
                El codigo solo puede usarse una vez.
              </p>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              Al crear el codigo, podras copiarlo y compartirlo con quien
              desees invitar a la comunidad.
            </p>
          )}
        </div>

        <DialogFooter>
          {plainCode ? (
            <Button variant="secondary" onClick={handleCopy} className="gap-2">
              {copied ? (
                <>
                  <CheckIcon />
                  Copiado
                </>
              ) : (
                <>
                  <Share2Icon />
                  Copiar codigo
                </>
              )}
            </Button>
          ) : (
            <Button onClick={handleCreate} disabled={loading}>
              {loading ? "Generando..." : "Generar codigo"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
