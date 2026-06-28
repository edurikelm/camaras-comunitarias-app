import type { SupabaseClient } from "@supabase/supabase-js";
import {
  EvidenceStorageError,
  type EvidenceStoragePort,
  type UploadFileInput,
} from "@/domain/community/evidence/evidence-storage";

export type SupabaseEvidenceStorageDeps = {
  client: SupabaseClient;
  bucket?: string;
};

export class SupabaseEvidenceStorageAdapter implements EvidenceStoragePort {
  private readonly client: SupabaseClient;
  private readonly bucket: string;

  constructor({ client, bucket = "evidence" }: SupabaseEvidenceStorageDeps) {
    this.client = client;
    this.bucket = bucket;
  }

  async uploadFile(input: UploadFileInput): Promise<void> {
    const fileBytes =
      input.file instanceof Buffer
        ? input.file
        : Buffer.from(new Uint8Array(input.file as ArrayBuffer));

    const { error } = await this.client.storage
      .from(this.bucket)
      .upload(input.storagePath, fileBytes, {
        contentType: input.mimeType,
        upsert: false,
      });

    if (error) {
      throw new EvidenceStorageError(
        `Failed to upload file "${input.storagePath}": ${error.message}`,
        error,
      );
    }
  }

  async createSignedUrl(
    storagePath: string,
    expiresInSeconds: number,
  ): Promise<string> {
    const { data, error } = await this.client.storage
      .from(this.bucket)
      .createSignedUrl(storagePath, expiresInSeconds);

    if (error || !data) {
      throw new EvidenceStorageError(
        `Failed to create signed URL for "${storagePath}": ${error?.message ?? "unknown error"}`,
        error,
      );
    }

    return data.signedUrl;
  }

  async deleteFile(storagePath: string): Promise<void> {
    const { error } = await this.client.storage
      .from(this.bucket)
      .remove([storagePath]);

    // Idempotent: si el archivo no existe, Supabase no devuelve error
    // (o devuelve "not found" que tratamos como exito compensatorio).
    if (error && !error.message.toLowerCase().includes("not found")) {
      throw new EvidenceStorageError(
        `Failed to delete file "${storagePath}": ${error.message}`,
        error,
      );
    }
  }
}
