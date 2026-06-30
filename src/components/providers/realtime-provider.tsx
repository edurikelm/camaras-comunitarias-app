"use client";

import {
  useEffect,
  useRef,
  useState,
  createContext,
  useContext,
  type ReactNode,
} from "react";
import type { Socket } from "socket.io-client";
import { useSupabase } from "@/components/providers/supabase-provider";
import { createRealtimeClient } from "@/lib/realtime/client";

export type RealtimeStatus = "disconnected" | "connecting" | "connected" | "error";

export type RealtimeContextValue = {
  status: RealtimeStatus;
  socket: Socket | null;
  error: Error | null;
};

const RealtimeContext = createContext<RealtimeContextValue | null>(null);

export function RealtimeProvider({ children }: { children: ReactNode }) {
  const supabase = useSupabase();
  const [status, setStatus] = useState<RealtimeStatus>("disconnected");
  const [socket, setSocket] = useState<Socket | null>(null);
  const [error, setError] = useState<Error | null>(null);

  // Referencia para evitar closure stale en el effect
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    let subscription: ReturnType<typeof supabase.auth.onAuthStateChange> | null = null;
    let currentSocket: Socket | null = null;

    async function connectWithSession() {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.access_token) {
        // Sin sesion: asegurar desconexion
        if (socketRef.current) {
          socketRef.current.disconnect();
          socketRef.current = null;
          setSocket(null);
          setStatus("disconnected");
        }
        return;
      }

      // Crear socket con el token actual
      const url = process.env.NEXT_PUBLIC_REALTIME_URL ?? "http://localhost:3001";
      currentSocket = createRealtimeClient({
        url,
        accessToken: session.access_token,
      });
      socketRef.current = currentSocket;
      setSocket(currentSocket);
      setError(null);

      // Listeners de estado de conexion
      currentSocket.on("connect", () => {
        setStatus("connected");
        setError(null);
      });

      currentSocket.on("disconnect", () => {
        setStatus("disconnected");
      });

      currentSocket.on("connect_error", (err) => {
        setStatus("error");
        setError(err instanceof Error ? err : new Error(String(err)));
      });

      setStatus("connecting");
      currentSocket.connect();
    }

    // Conexion inicial
    connectWithSession();

    // Suscribir a cambios de auth
    subscription = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === "SIGNED_OUT") {
        if (socketRef.current) {
          socketRef.current.disconnect();
          socketRef.current = null;
          setSocket(null);
          setStatus("disconnected");
        }
        return;
      }

      if (event === "TOKEN_REFRESHED" && session?.access_token) {
        // Actualizar auth y reconectar
        if (socketRef.current) {
          // Actualizar token en auth (patron socket.io para refresh)
          socketRef.current.auth = { token: session.access_token };
          socketRef.current.disconnect();
          socketRef.current.connect();
        }
        return;
      }

      // Otro evento: reevaluar sesion
      if (event !== "INITIAL_SESSION") {
        await connectWithSession();
      }
    });

    return () => {
      if (subscription.data?.subscription) {
        subscription.data.subscription.unsubscribe();
      }
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }
    };
  }, [supabase]);

  return (
    <RealtimeContext.Provider value={{ status, socket, error }}>
      {children}
    </RealtimeContext.Provider>
  );
}

export function useRealtime(): RealtimeContextValue {
  const ctx = useContext(RealtimeContext);
  if (!ctx) {
    throw new Error("useRealtime must be used within RealtimeProvider");
  }
  return ctx;
}
