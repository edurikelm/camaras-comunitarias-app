import { io, type Socket } from "socket.io-client";

export type CreateRealtimeClientOptions = {
  url: string;
  accessToken: string;
};

export function createRealtimeClient({
  url,
  accessToken,
}: CreateRealtimeClientOptions): Socket {
  return io(url, {
    auth: { token: accessToken },
    transports: ["websocket"],
    autoConnect: false, // el provider controla el ciclo de vida
    reconnection: true,
    reconnectionAttempts: 5,
    reconnectionDelay: 1000,
  });
}
