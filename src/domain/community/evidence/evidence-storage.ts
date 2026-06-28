import { CommunityInvariantError } from "@/domain/community/errors";

export type UploadFileInput = {
  /** Full storage path, e.g. `{communityId}/{incidentId}/{uuid}.{ext}` */
  storagePath: string;
  /**
   * File contents. Both `Buffer` (Node) and `ArrayBuffer` (Web/undici) are
   * accepted because the caller may produce either depending on transport.
   */
  file: Buffer | ArrayBuffer;
  /** MIME type of the file, e.g. "image/jpeg" */
  mimeType: string;
};

export interface EvidenceStoragePort {
  uploadFile(input: UploadFileInput): Promise<void>;
  createSignedUrl(storagePath: string, expiresInSeconds: number): Promise<string>;
  deleteFile(storagePath: string): Promise<void>;
}

/**
 * Error thrown when the evidence storage provider fails (Supabase, S3, R2, etc).
 *
 * Extends CommunityInvariantError so existing `instanceof CommunityInvariantError`
 * catches keep working (back-compat with ADR-0007 pattern). Distinct subclass lets
 * the DomainErrorMapper branch on it for accurate HTTP semantics: storage failures
 * are 502 Bad Gateway (upstream provider failed), not 400 Bad Request.
 */
export class EvidenceStorageError extends CommunityInvariantError {
  constructor(
    message: string,
    /** Optional underlying error from the storage provider, for logs only */
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = "EvidenceStorageError";
  }
}
