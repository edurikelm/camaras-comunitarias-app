import { NextRequest, NextResponse } from "next/server";

import { requireAuthenticatedUser } from "@/lib/api/auth-prelude";
import { createPrismaEvidenceRepository } from "@/infrastructure/prisma/evidence-repository";
import { mapDomainErrorToResponse } from "@/lib/api/domain-error-mapper";
import { uploadEvidence } from "@/domain/community/evidence/create-evidence";
import { getEvidence } from "@/domain/community/evidence/get-evidence";
import { createSupabaseEvidenceStorageFromEnv } from "@/infrastructure/storage";

export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// Allowed MIME types
// ---------------------------------------------------------------------------

const ALLOWED_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB

// ---------------------------------------------------------------------------
// POST — Upload evidence
// ---------------------------------------------------------------------------

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ communityId: string; incidentId: string }> },
) {
  const auth = await requireAuthenticatedUser(request);
  if (!auth.ok) return auth.response;

  try {
    // 3. Parse multipart/form-data
    const formData = await request.formData();
    const fileField = formData.get("file");

    if (!fileField || !(fileField instanceof File)) {
      return NextResponse.json(
        { error: "File is required (field 'file')" },
        { status: 400 },
      );
    }

    const file = fileField as File;

    // Validate MIME type
    if (!ALLOWED_MIME_TYPES.has(file.type)) {
      return NextResponse.json(
        {
          error: `Invalid file type: ${file.type}. Allowed: ${Array.from(ALLOWED_MIME_TYPES).join(", ")}`,
        },
        { status: 400 },
      );
    }

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: "File exceeds maximum size of 5 MB" },
        { status: 400 },
      );
    }

    // 4. Convert file to Buffer
    const fileBuffer = Buffer.from(await file.arrayBuffer());

    // 5. Parse optional metadata
    let metadata: Record<string, unknown> | undefined;
    const metadataField = formData.get("metadata");
    if (metadataField && typeof metadataField === "string") {
      try {
        metadata = JSON.parse(metadataField) as Record<string, unknown>;
      } catch {
        return NextResponse.json(
          { error: "metadata must be valid JSON" },
          { status: 400 },
        );
      }
    }

    // 6. Execute domain service
    const { communityId, incidentId } = await params;
    const evidenceRepository = createPrismaEvidenceRepository(auth.prisma);
    const evidenceStorage = createSupabaseEvidenceStorageFromEnv();

    const result = await uploadEvidence(
      {
        actor: { id: auth.actor.id },
        communityId,
        incidentId,
        file: fileBuffer,
        mimeType: file.type,
        metadata,
      },
      { evidenceRepository, evidenceStorage },
    );

    // 7. Respond 201
    return NextResponse.json({ data: result.evidence }, { status: 201 });
  } catch (error) {
    return mapDomainErrorToResponse(error, {
      method: "POST",
      path: "/api/communities/[communityId]/incidents/[incidentId]/evidence",
    });
  }
}

// ---------------------------------------------------------------------------
// GET — List evidence with signed URLs
// ---------------------------------------------------------------------------

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ communityId: string; incidentId: string }> },
) {
  const auth = await requireAuthenticatedUser(request);
  if (!auth.ok) return auth.response;

  try {
    // 3. Execute domain service
    const { communityId, incidentId } = await params;
    const evidenceRepository = createPrismaEvidenceRepository(auth.prisma);
    const evidenceStorage = createSupabaseEvidenceStorageFromEnv();

    const result = await getEvidence(
      {
        actor: { id: auth.actor.id },
        communityId,
        incidentId,
      },
      { evidenceRepository, evidenceStorage },
    );

    // 4. Respond 200
    return NextResponse.json({ data: result }, { status: 200 });
  } catch (error) {
    return mapDomainErrorToResponse(error, {
      method: "GET",
      path: "/api/communities/[communityId]/incidents/[incidentId]/evidence",
    });
  }
}
