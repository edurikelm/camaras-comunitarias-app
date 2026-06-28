import { NextRequest, NextResponse } from "next/server";

import { authenticateRequest } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { createPrismaCameraRepository } from "@/infrastructure/prisma/camera-repository";
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
  try {
    // 1. Authenticate
    const authUser = await authenticateRequest(request);
    if (!authUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // 2. Look up the platform user by authProviderId
    const prisma = getPrisma();
    const platformUser = await prisma.user.findUnique({
      where: { authProviderId: authUser.id },
      select: { id: true },
    });

    if (!platformUser) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

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
    const cameraRepository = createPrismaCameraRepository(prisma);

    const result = await setCameraPermission(
      {
        actor: { id: platformUser.id },
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
