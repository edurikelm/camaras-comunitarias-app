import { NextRequest, NextResponse } from "next/server";

import { requireAuthenticatedUser } from "@/lib/api/auth-prelude";
import { createPrismaCameraRepository } from "@/infrastructure/prisma/camera-repository";
import { createPrismaAuditLogAdapter } from "@/infrastructure/prisma/audit-log-adapter";
import { createRtspCipherFromEnv } from "@/infrastructure/security";
import { mapDomainErrorToResponse } from "@/lib/api/domain-error-mapper";
import { setCameraPermission } from "@/domain/community/camera/set-camera-permission";
import type { CommunityMemberRole } from "@/generated/prisma/enums";

export const dynamic = "force-dynamic";

type RequestBody = {
  role?: CommunityMemberRole;
  userId?: string;
  canViewLive: boolean;
  canRequestRecordings: boolean;
  scheduleStart?: string;
  scheduleEnd?: string;
};

export async function POST(
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

    if (typeof body.canViewLive !== "boolean") {
      return NextResponse.json(
        { error: "canViewLive is required and must be a boolean" },
        { status: 400 },
      );
    }

    if (typeof body.canRequestRecordings !== "boolean") {
      return NextResponse.json(
        { error: "canRequestRecordings is required and must be a boolean" },
        { status: 400 },
      );
    }

    // 4. Execute domain service
    const { communityId, cameraId } = await params;
    const rtspCipher = createRtspCipherFromEnv();
    const auditLog = createPrismaAuditLogAdapter(auth.prisma);
    const cameraRepository = createPrismaCameraRepository(auth.prisma, { rtspCipher, auditLog });

    const result = await setCameraPermission(
      {
        actor: { id: auth.actor.id },
        communityId,
        cameraId,
        permission: {
          role: body.role,
          userId: body.userId,
          canViewLive: body.canViewLive,
          canRequestRecordings: body.canRequestRecordings,
          scheduleStart: body.scheduleStart,
          scheduleEnd: body.scheduleEnd,
        },
      },
      { cameraRepository },
    );

    // 5. Respond 200/201 (200 if updated, 201 if created — we always respond 200 for upsert)
    return NextResponse.json(
      { data: { permission: result.permission } },
      { status: 200 },
    );
  } catch (error) {
    return mapDomainErrorToResponse(error, {
      method: "POST",
      path: "/api/communities/[communityId]/cameras/[cameraId]/permissions",
    });
  }
}
