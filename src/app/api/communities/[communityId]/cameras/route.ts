import { NextRequest, NextResponse } from "next/server";

import { authenticateRequest } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { createPrismaCameraRepository } from "@/infrastructure/prisma/camera-repository";
import {
  CommunityAuthorizationError,
  CommunityInvariantError,
} from "@/domain/community/errors";
import { registerCommunityCamera } from "@/domain/community/camera/register-community-camera";

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

    if (!/^rtsp:\/\//i.test(body.rtspUrl.trim())) {
      return NextResponse.json(
        { error: "rtspUrl must start with rtsp://" },
        { status: 400 },
      );
    }

    if (
      body.sectorId !== undefined &&
      body.sectorId !== null &&
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        body.sectorId,
      )
    ) {
      return NextResponse.json(
        { error: "sectorId must be a valid UUID" },
        { status: 400 },
      );
    }

    // 4. Execute domain service
    const { communityId } = await params;
    const cameraRepository = createPrismaCameraRepository(prisma);

    const result = await registerCommunityCamera(
      {
        actor: { id: platformUser.id },
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
      "[POST /api/communities/[communityId]/cameras] Unexpected error:",
      error,
    );
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
