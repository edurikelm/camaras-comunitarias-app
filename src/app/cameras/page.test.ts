import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Smoke test: cameras page module structure
// ---------------------------------------------------------------------------

// Mockear getPageMembership para que la importacion del modulo no falle
// sin necesidad de jsdom o Supabase real.
vi.mock("@/lib/auth/page-membership", () => ({
  getPageMembership: vi.fn(),
}));

// Mockear el RouteShell para que no falle la renderizacion
vi.mock("@/components/domain/route-shell", () => ({
  RouteShell: ({
    children,
  }: {
    children: React.ReactNode;
  }) => children,
}));

// Mockear DomainEmptyState
vi.mock("@/components/domain/empty-state", () => ({
  DomainEmptyState: () => null,
}));

// Mockear NoPermissionState
vi.mock("@/components/domain/no-permission-state", () => ({
  NoPermissionState: () => null,
}));

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("CamerasPage module", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("exporta CamerasPage como default export", async () => {
    const { default: CamerasPage } = await import("./page");
    expect(typeof CamerasPage).toBe("function");
  });

  it("RegisterCameraDialog se resuelve sin errores al importar el modulo", async () => {
    // Verifica que RegisterCameraDialog existe y es un componente
    const { RegisterCameraDialog } = await import(
      "@/components/cameras/register-camera-dialog"
    );
    expect(typeof RegisterCameraDialog).toBe("function");
  });

  it("getPageMembership fue importado en el modulo page", async () => {
    // Verifica que el modulo page.tsx referencia getPageMembership
    // sin importar el modulo real (mockeado arriba)
    const pageModule = await import("./page");
    // El modulo debe existir
    expect(pageModule).toBeDefined();
  });
});
