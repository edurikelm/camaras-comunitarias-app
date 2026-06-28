export type DomainErrorContext = {
  method: string; // ej: "GET", "POST", "PATCH"
  path: string;   // ej: "/api/cameras/[cameraId]/live"
};

export type DomainErrorResponse = {
  status: number;
  body: { error: string };
  /** Side-effect invoked by the mapper before returning the response. */
  log?: () => void;
};

export abstract class DomainError extends Error {
  abstract httpResponse(ctx: DomainErrorContext): DomainErrorResponse;
}