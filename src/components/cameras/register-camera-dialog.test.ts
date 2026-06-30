import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Module mocks — next/navigation
// ---------------------------------------------------------------------------

const mockRouter = {
  refresh: vi.fn(),
  push: vi.fn(),
};

vi.mock("next/navigation", () => ({
  useRouter: () => mockRouter,
}));

// ---------------------------------------------------------------------------
// Smoke test: verify module exports
// ---------------------------------------------------------------------------

describe("RegisterCameraDialog module", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("exporta RegisterCameraDialog como funcion", async () => {
    const { RegisterCameraDialog } = await import("./register-camera-dialog");
    expect(typeof RegisterCameraDialog).toBe("function");
  });
});

// ---------------------------------------------------------------------------
// Smoke test: Zod schema validation
// ---------------------------------------------------------------------------

describe("RegisterCameraDialog schema", () => {
  // Import schema via a separate module approach — we test the exported schema
  // from the dialog by exercising it through the form resolver.

  it("rechaza RTSP invalida (no comienza con rtsp://)", async () => {
    const { registerCameraSchema } = await import("./register-camera-dialog");
    const result = registerCameraSchema.safeParse({
      name: "Camara test",
      rtspUrl: "http://192.168.1.100/stream",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.errors[0].message).toMatch(/rtsp:\/\//);
    }
  });

  it("rechaza RTSP sin host (rtsp:// solo)", async () => {
    const { registerCameraSchema } = await import("./register-camera-dialog");
    const result = registerCameraSchema.safeParse({
      name: "Camara test",
      rtspUrl: "rtsp://",
    });
    expect(result.success).toBe(false);
  });

  it("rechaza streamKey con menos de 8 caracteres", async () => {
    const { registerCameraSchema } = await import("./register-camera-dialog");
    const result = registerCameraSchema.safeParse({
      name: "Camara test",
      rtspUrl: "rtsp://192.168.1.100:554/stream",
      streamKey: "1234567",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.errors[0].message).toMatch(/8 caracteres/);
    }
  });

  it("acepta RTSP valida con rtsp:// y host", async () => {
    const { registerCameraSchema } = await import("./register-camera-dialog");
    const result = registerCameraSchema.safeParse({
      name: "Camara test",
      rtspUrl: "rtsp://192.168.1.100:554/stream",
    });
    expect(result.success).toBe(true);
  });

  it("acepta nombre con maximo 100 caracteres", async () => {
    const { registerCameraSchema } = await import("./register-camera-dialog");
    const result = registerCameraSchema.safeParse({
      name: "A".repeat(100),
      rtspUrl: "rtsp://192.168.1.100:554/stream",
    });
    expect(result.success).toBe(true);
  });

  it("rechaza nombre con mas de 100 caracteres", async () => {
    const { registerCameraSchema } = await import("./register-camera-dialog");
    const result = registerCameraSchema.safeParse({
      name: "A".repeat(101),
      rtspUrl: "rtsp://192.168.1.100:554/stream",
    });
    expect(result.success).toBe(false);
  });

  it("omite campos opcionales vacios del body", async () => {
    const { registerCameraSchema } = await import("./register-camera-dialog");
    const result = registerCameraSchema.safeParse({
      name: "Camara test",
      rtspUrl: "rtsp://192.168.1.100:554/stream",
      description: "",
      approximateLocation: "",
      sectorId: "",
      streamKey: "",
    });
    expect(result.success).toBe(true);
    const values = result.data!;
    // Los opcionales vacios se transforman a "" y optional().or(z.literal("")) los deja como ""
    // El fetch body solo incluye los que tienen valor no vacio
    expect(values.description).toBe("");
    expect(values.approximateLocation).toBe("");
  });
});
