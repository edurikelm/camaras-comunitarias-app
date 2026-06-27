import { NextRequest, NextResponse } from "next/server";

import { authenticateRequest } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { createPrismaCameraRepository } from "@/infrastructure/prisma/camera-repository";
import {
  CommunityAuthorizationError,
  CommunityInvariantError,
} from "@/domain/community/errors";
import { requestLiveViewToken } from "@/domain/community/camera/request-live-view-token";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ cameraId: string }> },
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

    // 3. Execute domain service
    const { cameraId } = await params;
    const cameraRepository = createPrismaCameraRepository(prisma);

    const result = await requestLiveViewToken(
      {
        actor: { id: platformUser.id },
        cameraId,
      },
      { cameraRepository },
    );

    // 4. Respond 200
    return NextResponse.json(
      {
        streamUrl: result.streamUrl,
        token: result.token,
        expiresAt: result.expiresAt.toISOString(),
      },
      { status: 200 },
    );
  } catch (error) {
    if (error instanceof CommunityAuthorizationError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }

    if (error instanceof CommunityInvariantError) {
      const status = error.message.toLowerCase().includes("not found")
        ? 404
        : 400;
      return NextResponse.json({ error: error.message }, { status });
    }

    console.error(
      "[GET /api/cameras/[cameraId]/live] Unexpected error:",
      error,
    );
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
