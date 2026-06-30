"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useRealtime } from "@/components/providers/realtime-provider";

const DEBOUNCE_MS = 500;

export function RealtimeRefresh() {
  const { socket } = useRealtime();
  const router = useRouter();
  const pathname = usePathname();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!socket) return;

    function scheduleRefresh() {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
      timerRef.current = setTimeout(() => {
        router.refresh();
      }, DEBOUNCE_MS);
    }

    function isRelevantPath() {
      // `pathname` no incluye query string, asi que startsWith es seguro para
      // matchear `/incidents`, `/incidents/`, etc. Query params no afectan el match.
      return pathname === "/incidents" || pathname.startsWith("/incidents/") ||
        pathname === "/dashboard" || pathname.startsWith("/dashboard/");
    }

    function handleIncidentCreated() {
      if (isRelevantPath()) scheduleRefresh();
    }

    function handleAlertCreated() {
      // alert.created tiene la misma audiencia que incident.created (ADR-0017),
      // asi que cualquier pagina que reacciona a uno reacciona al otro.
      if (isRelevantPath()) scheduleRefresh();
    }

    function handleMemberStatusChanged() {
      if (pathname === "/dashboard" || pathname.startsWith("/dashboard/")) {
        scheduleRefresh();
      }
    }

    function handleRecordingRequestResponded() {
      if (pathname === "/dashboard" || pathname.startsWith("/dashboard/")) {
        scheduleRefresh();
      }
    }

    function handleRecordingRequestCreated() {
      if (pathname === "/dashboard" || pathname.startsWith("/dashboard/")) {
        scheduleRefresh();
      }
    }

    socket.on("incident.created", handleIncidentCreated);
    socket.on("alert.created", handleAlertCreated);
    socket.on(
      "community-member.status-changed",
      handleMemberStatusChanged
    );
    socket.on("recording-request.responded", handleRecordingRequestResponded);
    socket.on("recording-request.created", handleRecordingRequestCreated);

    return () => {
      socket.off("incident.created", handleIncidentCreated);
      socket.off("alert.created", handleAlertCreated);
      socket.off(
        "community-member.status-changed",
        handleMemberStatusChanged
      );
      socket.off("recording-request.responded", handleRecordingRequestResponded);
      socket.off("recording-request.created", handleRecordingRequestCreated);
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, [socket, pathname, router]);

  return null;
}
