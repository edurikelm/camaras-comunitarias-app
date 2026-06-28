"use client";

import { useState } from "react";
import {
  CheckIcon,
  ShieldCheckIcon,
  UserCheckIcon,
  UserXIcon,
  XIcon,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type PendingMember = {
  id: string;
  userId: string;
  user: {
    name: string | null;
    email: string;
  };
  createdAt: string;
};

type MemberApprovalListProps = {
  communityId: string;
  pendingMembers: PendingMember[];
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function MemberApprovalList({
  communityId,
  pendingMembers,
}: MemberApprovalListProps) {
  const [members, setMembers] = useState(pendingMembers);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [approveDialog, setApproveDialog] = useState<{
    memberId: string;
    memberName: string;
  } | null>(null);
  const [selectedRole, setSelectedRole] = useState<"NEIGHBOR" | "GUARD">(
    "NEIGHBOR",
  );

  if (members.length === 0) {
    return null;
  }

  async function handleApprove(memberId: string) {
    setProcessingId(memberId);
    setError(null);
    setApproveDialog(null);

    try {
      const res = await fetch(
        `/api/communities/${communityId}/members/${memberId}/approve`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ role: selectedRole }),
        },
      );

      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? "Error al aprobar miembro");
      }

      setMembers((prev) => prev.filter((m) => m.id !== memberId));
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Error inesperado",
      );
    } finally {
      setProcessingId(null);
    }
  }

  async function handleReject(memberId: string) {
    setProcessingId(memberId);
    setError(null);

    try {
      const res = await fetch(
        `/api/communities/${communityId}/members/${memberId}/reject`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        },
      );

      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? "Error al rechazar miembro");
      }

      setMembers((prev) => prev.filter((m) => m.id !== memberId));
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Error inesperado",
      );
    } finally {
      setProcessingId(null);
    }
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <UserCheckIcon data-icon="inline-start" />
            Solicitudes pendientes ({members.length})
          </CardTitle>
          <CardDescription>
            Usuarios que han solicitado ingresar a la comunidad usando un codigo
            de invitacion. Revisa y aprueba o rechaza cada solicitud.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {error && (
            <div className="rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {error}
            </div>
          )}

          {members.map((member) => (
            <div
              key={member.id}
              className="flex items-center justify-between rounded-lg border p-3"
            >
              <div className="flex min-w-0 flex-col gap-1">
                <span className="truncate font-medium">
                  {member.user.name ?? "Sin nombre"}
                </span>
                <span className="truncate text-sm text-muted-foreground">
                  {member.user.email}
                </span>
                <Badge variant="outline" className="w-fit text-xs">
                  Pendiente
                </Badge>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Button
                  variant="default"
                  size="sm"
                  onClick={() =>
                    setApproveDialog({
                      memberId: member.id,
                      memberName: member.user.name ?? member.user.email,
                    })
                  }
                  disabled={processingId === member.id}
                >
                  <CheckIcon />
                  Aprobar
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => handleReject(member.id)}
                  disabled={processingId === member.id}
                >
                  <XIcon />
                  Rechazar
                </Button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Approve dialog with role selection */}
      <Dialog
        open={!!approveDialog}
        onOpenChange={(open) => {
          if (!open) setApproveDialog(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Aprobar miembro</DialogTitle>
            <DialogDescription>
              Selecciona el rol para{" "}
              <strong>{approveDialog?.memberName ?? ""}</strong>.
              El rol puede cambiarse despues desde la gestion de miembros.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-3 py-4">
            <Button
              variant={selectedRole === "NEIGHBOR" ? "default" : "outline"}
              className="justify-start gap-3"
              onClick={() => setSelectedRole("NEIGHBOR")}
            >
              <UserCheckIcon />
              <div className="flex flex-col items-start text-left">
                <span className="font-medium">Vecino</span>
                <span className="text-xs text-muted-foreground">
                  Puede compartir camaras, reportar incidentes y recibir alertas
                </span>
              </div>
            </Button>
            <Button
              variant={selectedRole === "GUARD" ? "default" : "outline"}
              className="justify-start gap-3"
              onClick={() => setSelectedRole("GUARD")}
            >
              <ShieldCheckIcon />
              <div className="flex flex-col items-start text-left">
                <span className="font-medium">Guardia</span>
                <span className="text-xs text-muted-foreground">
                  Seguridad operativa: puede ver camaras autorizadas y gestionar
                  incidentes
                </span>
              </div>
            </Button>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setApproveDialog(null)}
            >
              Cancelar
            </Button>
            <Button
              onClick={() =>
                approveDialog && handleApprove(approveDialog.memberId)
              }
              disabled={processingId !== null}
            >
              {processingId ? "Aprobando..." : "Confirmar y aprobar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
