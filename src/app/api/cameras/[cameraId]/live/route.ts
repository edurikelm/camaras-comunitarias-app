import { NextRequest, NextResponse } from "next/server";

import { requireAuthenticatedUser } from "@/lib/api/auth-prelude";
import { createPrismaCameraRepository } from "@/infrastructure/prisma/camera-repository";
import { createLiveStreamTokenIssuerFromEnv } from "@/infrastructure/streaming";
import { mapDomainErrorToResponse } from "@/lib/api/domain-error-mapper";
import { requestLiveViewToken } from "@/domain/community/camera/request-live-view-token";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ cameraId: string }> },
) {
  const auth = await requireAuthenticatedUser(request);
  if (!auth.ok) return auth.response;

  try {
    // 3. Execute domain service
    const { cameraId } = await params;
    const cameraRepository = createPrismaCameraRepository(auth.prisma);

    const result = await requestLiveViewToken(
      {
        actor: { id: auth.actor.id },
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
