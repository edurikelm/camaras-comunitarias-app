import { NextRequest, NextResponse } from "next/server";

import { authenticateRequest } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { createPrismaCameraRepository } from "@/infrastructure/prisma/camera-repository";
import {
  CommunityAuthorizationError,
  CommunityInvariantError,
} from "@/domain/community/errors";
import { removeCameraPermission } from "@/domain/community/camera/remove-camera-permission";

export const dynamic = "force-dynamic";

export async function DELETE(
  _request: NextRequest,
  {
    params,
  }: {
    params: Promise<{
      communityId: string;
      cameraId: string;
      permissionId: string;
    }>;
  },
) {
  try {
    // 1. Authenticate
    const authUser = await authenticateRequest(_request);
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
    const { communityId, cameraId, permissionId } = await params;
    const cameraRepository = createPrismaCameraRepository(prisma);

    const result = await removeCameraPermission(
      {
        actor: { id: platformUser.id },
        communityId,
        cameraId,
        permissionId,
      },
      { cameraRepository },
    );

    // 4. Respond 200
    return NextResponse.json(
      { data: { deleted: result.deleted } },
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
      "[DELETE /api/communities/[communityId]/cameras/[cameraId]/permissions/[permissionId]] Unexpected error:",
      error,
    );
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
