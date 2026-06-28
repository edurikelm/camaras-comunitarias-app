import { NextRequest, NextResponse } from "next/server";

import { requireAuthenticatedUser } from "@/lib/api/auth-prelude";
import { createPrismaCameraRepository } from "@/infrastructure/prisma/camera-repository";
import { mapDomainErrorToResponse } from "@/lib/api/domain-error-mapper";
import { registerCommunityCamera } from "@/domain/community/camera/register-community-camera";
import { isRtspUrl, isUuid } from "@/domain/shared/validators";

export const dynamic = "force-dynamic";

type RequestBody = {
  name: string;
  description?: string;
  approximateLocation?: string;
  sectorId?: string;
  rtspUrl: string;
  streamKey?: string;
};

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ communityId: string }> },
) {
  const auth = await requireAuthenticatedUser(request);
  if (!auth.ok) return auth.response;

  try {
    // 3. Parse and validate body
    const body: RequestBody = await request.json();

    if (!body.name || !body.name.trim()) {
      return NextResponse.json(
        { error: "name is required" },
        { status: 400 },
      );
    }

    if (!body.rtspUrl || !body.rtspUrl.trim()) {
      return NextResponse.json(
        { error: "rtspUrl is required" },
        { status: 400 },
      );
    }

    if (!isRtspUrl(body.rtspUrl)) {
      return NextResponse.json(
        { error: "rtspUrl must start with rtsp://" },
        { status: 400 },
      );
    }

    if (
      body.sectorId !== undefined &&
      body.sectorId !== null &&
      !isUuid(body.sectorId)
    ) {
      return NextResponse.json(
        { error: "sectorId must be a valid UUID" },
        { status: 400 },
      );
    }

    // 4. Execute domain service
    const { communityId } = await params;
    const cameraRepository = createPrismaCameraRepository(auth.prisma);

    const result = await registerCommunityCamera(
      {
        actor: { id: auth.actor.id },
        communityId,
        name: body.name,
        description: body.description,
        approximateLocation: body.approximateLocation,
        sectorId: body.sectorId,
        rtspUrl: body.rtspUrl,
        streamKey: body.streamKey,
      },
      { cameraRepository },
    );

    // 5. Respond 201
    return NextResponse.json(
      { data: { camera: result.camera } },
      { status: 201 },
    );
  } catch (error) {
    return mapDomainErrorToResponse(error, {
      method: "POST",
      path: "/api/communities/[communityId]/cameras",
    });
  }
}
