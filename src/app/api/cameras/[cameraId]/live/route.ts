import { NextRequest, NextResponse } from "next/server";

import { authenticateRequest } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { createPrismaCameraRepository } from "@/infrastructure/prisma/camera-repository";
import { createLiveStreamTokenIssuerFromEnv } from "@/infrastructure/streaming";
import { mapDomainErrorToResponse } from "@/lib/api/domain-error-mapper";
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
      { cameraRepository, liveStreamTokenIssuer: createLiveStreamTokenIssuerFromEnv() },
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
    return mapDomainErrorToResponse(error, {
      method: "GET",
      path: "/api/cameras/[cameraId]/live",
    });
  }
}
