import { getSupabaseAdmin } from "@/lib/supabase-admin";
import type { EvidenceStoragePort } from "@/domain/community/evidence/evidence-storage";
import { SupabaseEvidenceStorageAdapter } from "./supabase-evidence-storage";

/**
 * Creates a Supabase-backed EvidenceStoragePort using env configuration.
 * Reads EVIDENCE_STORAGE_BUCKET (defaults to "evidence").
 */
export function createSupabaseEvidenceStorageFromEnv(): EvidenceStoragePort {
  const client = getSupabaseAdmin();
  const bucket = process.env.EVIDENCE_STORAGE_BUCKET ?? "evidence";
  return new SupabaseEvidenceStorageAdapter({ client, bucket });
}
