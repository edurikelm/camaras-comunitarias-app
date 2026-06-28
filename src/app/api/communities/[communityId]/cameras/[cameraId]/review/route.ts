import { NextRequest, NextResponse } from "next/server";

import { requireAuthenticatedUser } from "@/lib/api/auth-prelude";
import { createPrismaCameraRepository } from "@/infrastructure/prisma/camera-repository";
import { createPrismaAuditLogAdapter } from "@/infrastructure/prisma/audit-log-adapter";
import { createRtspCipherFromEnv } from "@/infrastructure/security";
import { mapDomainErrorToResponse } from "@/lib/api/domain-error-mapper";
import { reviewCamera } from "@/domain/community/camera/review-camera";

export const dynamic = "force-dynamic";

type RequestBody = {
  action: "APPROVE" | "REJECT";
  reviewNote?: string;
};

export async function PATCH(
  request: NextRequest,
  {
    params,
  }: {
    params: Promise<{ communityId: string; cameraId: string }>;
  },
) {
  const auth = await requireAuthenticatedUser(request);
  if (!auth.ok) return auth.response;

  try {
    // 3. Parse body
    const body: RequestBody = await request.json();

    if (!body.action || !["APPROVE", "REJECT"].includes(body.action)) {
      return NextResponse.json(
        { error: "action is required and must be APPROVE or REJECT" },
        { status: 400 },
      );
    }

    // 4. Execute domain service
    const { communityId, cameraId } = await params;
    const rtspCipher = createRtspCipherFromEnv();
    const auditLog = createPrismaAuditLogAdapter(auth.prisma);
    const cameraRepository = createPrismaCameraRepository(auth.prisma, { rtspCipher, auditLog });

    const result = await reviewCamera(
      {
        actor: { id: auth.actor.id },
        communityId,
        cameraId,
        action: body.action,
        reviewNote: body.reviewNote,
      },
      { cameraRepository },
    );

    // 5. Respond 200
    return NextResponse.json(
      { data: { camera: result.camera } },
      { status: 200 },
    );
  } catch (error) {
    return mapDomainErrorToResponse(error, {
      method: "PATCH",
      path: "/api/communities/[communityId]/cameras/[cameraId]/review",
    });
  }
}
