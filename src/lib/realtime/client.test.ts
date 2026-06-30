import { describe, it, expect, vi } from "vitest";
import { createRealtimeClient } from "./client";

// El factory es una funcion pura que delega a socket.io-client.
// No necesitamos testear que io() es llamado con los parametros exactos
// (eso es test de integracion). Testeamos que:
// 1. La funcion existe y es exportada
// 2. Retorna un objeto con la interfaz de Socket
describe("createRealtimeClient", () => {
  it("exporta una funcion que retorna un Socket", () => {
    const socket = createRealtimeClient({
      url: "http://localhost:3001",
      accessToken: "test-token",
    });

    // Verificar interfaz minima de Socket
    expect(socket).toBeDefined();
    expect(typeof socket.on).toBe("function");
    expect(typeof socket.off).toBe("function");
    expect(typeof socket.connect).toBe("function");
    expect(typeof socket.disconnect).toBe("function");
  });

  it("retorna un socket por cada llamada", () => {
    const socket1 = createRealtimeClient({
      url: "http://localhost:3001",
      accessToken: "token-1",
    });
    const socket2 = createRealtimeClient({
      url: "http://localhost:3001",
      accessToken: "token-2",
    });

    // Cada llamada retorna un socket nuevo
    expect(socket1).not.toBe(socket2);
  });
});
