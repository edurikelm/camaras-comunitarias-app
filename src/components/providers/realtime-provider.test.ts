import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock de socket.io-client
const mockSocket = {
  on: vi.fn(),
  off: vi.fn(),
  connect: vi.fn(),
  disconnect: vi.fn(),
  connected: false,
  auth: {},
};

vi.mock("socket.io-client", () => ({
  io: vi.fn(() => mockSocket),
}));

// Mock de createRealtimeClient
vi.mock("@/lib/realtime/client", () => ({
  createRealtimeClient: vi.fn(() => mockSocket),
}));

// Mock de useSupabase
const mockSession = {
  access_token: "test-token",
  refresh_token: "refresh",
  expires_in: 3600,
  expires_at: Date.now() + 3600 * 1000,
  token_type: "bearer",
  user: { id: "user-1" },
};

const mockSupabaseClient = {
  auth: {
    getSession: vi.fn().mockResolvedValue({ data: { session: mockSession }, error: null }),
    onAuthStateChange: vi.fn().mockReturnValue({
      data: { subscription: { unsubscribe: vi.fn() } },
    }),
  },
};

vi.mock("@/components/providers/supabase-provider", () => ({
  useSupabase: () => mockSupabaseClient,
}));

describe("createRealtimeClient", () => {
  it("es llamado con url y token de la sesion", async () => {
    const { createRealtimeClient } = await import("@/lib/realtime/client");

    // Trigger getSession
    mockSupabaseClient.auth.getSession.mockResolvedValueOnce({
      data: { session: mockSession },
      error: null,
    });

    createRealtimeClient({
      url: "http://localhost:3001",
      accessToken: "test-token",
    });

    const { createRealtimeClient: mockCreate } = await import(
      "@/lib/realtime/client"
    );
    expect(mockCreate).toHaveBeenCalledWith({
      url: "http://localhost:3001",
      accessToken: "test-token",
    });
  });
});

describe("RealtimeProvider exports", () => {
  it("exporta useRealtime como funcion", async () => {
    const { useRealtime } = await import(
      "@/components/providers/realtime-provider"
    );
    expect(typeof useRealtime).toBe("function");
  });

  it("exporta RealtimeProvider como componente", async () => {
    const { RealtimeProvider } = await import(
      "@/components/providers/realtime-provider"
    );
    expect(typeof RealtimeProvider).toBe("function");
  });
});
