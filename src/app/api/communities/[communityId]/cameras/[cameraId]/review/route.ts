import { NextRequest, NextResponse } from "next/server";

import { authenticateRequest } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { createPrismaCameraRepository } from "@/infrastructure/prisma/camera-repository";
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

    if (!body.action || !["APPROVE", "REJECT"].includes(body.action)) {
      return NextResponse.json(
        { error: "action is required and must be APPROVE or REJECT" },
        { status: 400 },
      );
    }

    // 4. Execute domain service
    const { communityId, cameraId } = await params;
    const cameraRepository = createPrismaCameraRepository(prisma);

    const result = await reviewCamera(
      {
        actor: { id: platformUser.id },
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
