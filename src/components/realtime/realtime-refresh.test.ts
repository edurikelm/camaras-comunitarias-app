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
vi.mock("@/components/providers/supabase-provider", () => ({
  useSupabase: () => ({
    auth: {
      getSession: vi.fn().mockResolvedValue({
        data: { session: { access_token: "test-token" } },
        error: null,
      }),
      onAuthStateChange: vi.fn().mockReturnValue({
        data: { subscription: { unsubscribe: vi.fn() } },
      }),
    },
  }),
}));

// Mock de next/navigation
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
  usePathname: () => "/dashboard",
}));

describe("RealtimeRefresh module", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSocket.on.mockClear();
    mockSocket.off.mockClear();
  });

  it("exporta RealtimeRefresh como funcion", async () => {
    const { RealtimeRefresh } = await import("./realtime-refresh");
    expect(typeof RealtimeRefresh).toBe("function");
  });
});
