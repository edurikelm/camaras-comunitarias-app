import { describe, expect, it, vi } from "vitest";
import { SupabaseEvidenceStorageAdapter } from "./supabase-evidence-storage";
import { EvidenceStorageError } from "@/domain/community/evidence/evidence-storage";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createMockClient() {
  const storage = {
    from: vi.fn().mockImplementation(() => storage),
    upload: vi.fn().mockResolvedValue({ error: null }),
    createSignedUrl: vi.fn().mockResolvedValue({
      data: null,
      error: null,
    }),
    remove: vi.fn().mockResolvedValue({ error: null }),
  };

  return { storage };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("SupabaseEvidenceStorageAdapter", () => {
  describe("uploadFile()", () => {
    it("llama a client.storage.from(bucket).upload con bytes, contentType y upsert:false", async () => {
      const mockClient = createMockClient();
      mockClient.storage.upload.mockResolvedValue({ error: null });

      const adapter = new SupabaseEvidenceStorageAdapter({
        client: mockClient as never,
        bucket: "evidence",
      });

      const pngBytes = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
      await adapter.uploadFile({
        storagePath: "community-1/incident-1/uuid.png",
        file: pngBytes,
        mimeType: "image/png",
      });

      expect(mockClient.storage.from).toHaveBeenCalledWith("evidence");
      expect(mockClient.storage.upload).toHaveBeenCalledWith(
        "community-1/incident-1/uuid.png",
        pngBytes,
        { contentType: "image/png", upsert: false },
      );
    });

    it("normaliza ArrayBuffer a Buffer antes de subir", async () => {
      const mockClient = createMockClient();
      mockClient.storage.upload.mockResolvedValue({ error: null });

      const adapter = new SupabaseEvidenceStorageAdapter({
        client: mockClient as never,
        bucket: "evidence",
      });

      const arrayBuffer = new Uint8Array([0x89, 0x50, 0x4e, 0x47]).buffer;
      await adapter.uploadFile({
        storagePath: "community-1/incident-1/uuid.png",
        file: arrayBuffer,
        mimeType: "image/png",
      });

      const uploadCall = mockClient.storage.upload.mock.calls[0];
      const uploadedBytes = uploadCall[1] as Buffer;
      expect(uploadedBytes).toBeInstanceOf(Buffer);
      expect(Buffer.from(uploadedBytes)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    });

    it("lanza EvidenceStorageError con cause cuando Supabase devuelve error", async () => {
      const mockClient = createMockClient();
      mockClient.storage.upload.mockResolvedValue({
        error: { message: "Bucket not found" },
      });

      const adapter = new SupabaseEvidenceStorageAdapter({
        client: mockClient as never,
        bucket: "evidence",
      });

      await expect(
        adapter.uploadFile({
          storagePath: "bad/path.png",
          file: Buffer.from([0x89]),
          mimeType: "image/png",
        }),
      ).rejects.toThrow(EvidenceStorageError);

      await expect(
        adapter.uploadFile({
          storagePath: "bad/path.png",
          file: Buffer.from([0x89]),
          mimeType: "image/png",
        }),
      ).rejects.toMatchObject({
        message: 'Failed to upload file "bad/path.png": Bucket not found',
        cause: { message: "Bucket not found" },
      });
    });
  });

  describe("createSignedUrl()", () => {
    it("retorna data.signedUrl cuando tiene exito", async () => {
      const mockClient = createMockClient();
      mockClient.storage.createSignedUrl = vi.fn().mockResolvedValue({
        data: { signedUrl: "https://signed.example.com/file.jpg?token=xyz" },
        error: null,
      });

      const adapter = new SupabaseEvidenceStorageAdapter({
        client: mockClient as never,
        bucket: "evidence",
      });

      const result = await adapter.createSignedUrl(
        "community-1/incident-1/uuid.jpg",
        3600,
      );

      expect(result).toBe("https://signed.example.com/file.jpg?token=xyz");
      expect(mockClient.storage.createSignedUrl).toHaveBeenCalledWith(
        "community-1/incident-1/uuid.jpg",
        3600,
      );
    });

    it("lanza EvidenceStorageError cuando hay error de Supabase", async () => {
      const mockClient = createMockClient();
      mockClient.storage.createSignedUrl = vi.fn().mockResolvedValue({
        data: null,
        error: { message: "File not found" },
      });

      const adapter = new SupabaseEvidenceStorageAdapter({
        client: mockClient as never,
        bucket: "evidence",
      });

      await expect(
        adapter.createSignedUrl("nonexistent/path.jpg", 3600),
      ).rejects.toThrow(EvidenceStorageError);

      await expect(
        adapter.createSignedUrl("nonexistent/path.jpg", 3600),
      ).rejects.toMatchObject({
        message: 'Failed to create signed URL for "nonexistent/path.jpg": File not found',
        cause: { message: "File not found" },
      });
    });

    it("lanza EvidenceStorageError cuando data es null aunque error sea null", async () => {
      const mockClient = createMockClient();
      mockClient.storage.createSignedUrl = vi.fn().mockResolvedValue({
        data: null,
        error: null,
      });

      const adapter = new SupabaseEvidenceStorageAdapter({
        client: mockClient as never,
        bucket: "evidence",
      });

      await expect(
        adapter.createSignedUrl("any/path.jpg", 3600),
      ).rejects.toThrow(EvidenceStorageError);

      await expect(
        adapter.createSignedUrl("any/path.jpg", 3600),
      ).rejects.toMatchObject({
        message: 'Failed to create signed URL for "any/path.jpg": unknown error',
      });
    });

    it("pasa expiresInSeconds correctamente al SDK de Supabase", async () => {
      const mockClient = createMockClient();
      mockClient.storage.createSignedUrl = vi.fn().mockResolvedValue({
        data: { signedUrl: "https://signed.example.com/file.jpg?token=xyz" },
        error: null,
      });

      const adapter = new SupabaseEvidenceStorageAdapter({
        client: mockClient as never,
        bucket: "evidence",
      });

      await adapter.createSignedUrl("path/file.jpg", 7200);

      expect(mockClient.storage.createSignedUrl).toHaveBeenCalledWith(
        "path/file.jpg",
        7200,
      );
    });
  });

  describe("deleteFile()", () => {
    it("no lanza cuando la eliminacion es exitosa", async () => {
      const mockClient = createMockClient();
      mockClient.storage.remove = vi.fn().mockResolvedValue({ error: null });

      const adapter = new SupabaseEvidenceStorageAdapter({
        client: mockClient as never,
        bucket: "evidence",
      });

      await expect(
        adapter.deleteFile("community-1/incident-1/uuid.jpg"),
      ).resolves.toBeUndefined();

      expect(mockClient.storage.remove).toHaveBeenCalledWith([
        "community-1/incident-1/uuid.jpg",
      ]);
    });

    it("trata como exito (idempotente) cuando el archivo no existe", async () => {
      const mockClient = createMockClient();
      mockClient.storage.remove = vi.fn().mockResolvedValue({
        error: { message: "Not found" },
      });

      const adapter = new SupabaseEvidenceStorageAdapter({
        client: mockClient as never,
        bucket: "evidence",
      });

      // No debe lanzar aunque el archivo no exista
      await expect(
        adapter.deleteFile("nonexistent/path.jpg"),
      ).resolves.toBeUndefined();
    });

    it("lanza EvidenceStorageError para errores distintos a not found", async () => {
      const mockClient = createMockClient();
      mockClient.storage.remove = vi.fn().mockResolvedValue({
        error: { message: "Unauthorized" },
      });

      const adapter = new SupabaseEvidenceStorageAdapter({
        client: mockClient as never,
        bucket: "evidence",
      });

      await expect(adapter.deleteFile("forbidden/path.jpg")).rejects.toThrow(
        EvidenceStorageError,
      );

      await expect(adapter.deleteFile("forbidden/path.jpg")).rejects.toMatchObject({
        message: 'Failed to delete file "forbidden/path.jpg": Unauthorized',
        cause: { message: "Unauthorized" },
      });
    });
  });
});
