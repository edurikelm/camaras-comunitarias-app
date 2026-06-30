"use client";

import { useEffect } from "react";
import { toast } from "sonner";
import { useRealtime } from "@/components/providers/realtime-provider";
import type { AlertCreatedPayload } from "@shared/realtime/events/incident-events";
import type { IncidentCreatedPayload } from "@shared/realtime/events/incident-events";
import type { MemberStatusChangedPayload } from "@shared/realtime/events/membership-events";
import type {
  RecordingRequestCreatedPayload,
  RecordingRequestRespondedPayload,
} from "@shared/realtime/events/recording-request-events";

const INCIDENT_TYPE_LABELS: Record<string, string> = {
  THEFT: "Robo",
  SUSPICIOUS_PERSON: "Persona sospechosa",
  SUSPICIOUS_VEHICLE: "Vehiculo sospechoso",
  EMERGENCY: "Emergencia",
  ACCIDENT: "Accidente",
  OTHER: "Otro",
};

function handleAlertCreated(payload: AlertCreatedPayload) {
  const severity = payload.severity;
  const title =
    severity === "CRITICAL"
      ? `Alerta CRITICAL: ${payload.message}`
      : severity === "HIGH"
        ? `Alerta HIGH: ${payload.message}`
        : severity === "MEDIUM"
          ? `Alerta MEDIUM: ${payload.message}`
          : `Alerta LOW: ${payload.message}`;

  // El payload solo trae sectorId (UUID). Mostramos un mensaje generico
  // en vez del UUID crudo (regla de no exponer identificadores tecnicos al usuario final).
  const description = payload.sectorId ? "En tu sector" : undefined;

  if (severity === "CRITICAL" || severity === "HIGH") {
    toast.error(title, description ? { description } : undefined);
  } else if (severity === "MEDIUM") {
    toast.warning(title, description ? { description } : undefined);
  } else {
    toast(title, description ? { description } : undefined);
  }
}

function handleIncidentCreated(payload: IncidentCreatedPayload) {
  const typeLabel = INCIDENT_TYPE_LABELS[payload.type] ?? payload.type;
  toast(`Nuevo incidente: ${typeLabel} [${payload.severity}]`, {
    description: payload.description,
  });
}

function handleMemberStatusChanged(payload: MemberStatusChangedPayload) {
  if (payload.newStatus === "ACTIVE") {
    toast.success("Membresia activa", {
      description: "Tu solicitud fue aprobada.",
    });
  } else if (payload.newStatus === "BLOCKED") {
    toast.error("Membresia bloqueada", {
      description: "Tu acceso ha sido restringido. Contacta al administrador.",
    });
  }
}

function handleRecordingRequestCreated(
  _payload: RecordingRequestCreatedPayload
) {
  toast("Nueva solicitud de grabacion", {
    description: "Un vecino solicito revisar una de tus camaras.",
  });
}

function handleRecordingRequestResponded(payload: RecordingRequestRespondedPayload) {
  // `responseComment` es `string | null`. `||` colapsa null a undefined para que
  // sonner omita la descripcion en vez de renderizar literal `null`.
  if (payload.status === "ACCEPTED") {
    toast.success("Solicitud aceptada", {
      description: payload.responseComment || undefined,
    });
  } else if (payload.status === "REJECTED") {
    toast.error("Solicitud rechazada", {
      description: payload.responseComment || undefined,
    });
  }
  // PENDING no se emite en responded (solo se responde), pero defensivamente lo ignoramos.
}

export function RealtimeToaster() {
  const { socket } = useRealtime();

  useEffect(() => {
    if (!socket) return;

    socket.on("alert.created", handleAlertCreated);
    socket.on("incident.created", handleIncidentCreated);
    socket.on("community-member.status-changed", handleMemberStatusChanged);
    socket.on("recording-request.created", handleRecordingRequestCreated);
    socket.on("recording-request.responded", handleRecordingRequestResponded);

    return () => {
      socket.off("alert.created", handleAlertCreated);
      socket.off("incident.created", handleIncidentCreated);
      socket.off("community-member.status-changed", handleMemberStatusChanged);
      socket.off("recording-request.created", handleRecordingRequestCreated);
      socket.off("recording-request.responded", handleRecordingRequestResponded);
    };
  }, [socket]);

  return null;
}
