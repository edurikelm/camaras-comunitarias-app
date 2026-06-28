import { NextRequest, NextResponse } from "next/server";

import { requireAuthenticatedUser } from "@/lib/api/auth-prelude";
import { createPrismaCameraRepository } from "@/infrastructure/prisma/camera-repository";
import { mapDomainErrorToResponse } from "@/lib/api/domain-error-mapper";
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
  const auth = await requireAuthenticatedUser(_request);
  if (!auth.ok) return auth.response;

  try {
    // 3. Execute domain service
    const { communityId, cameraId, permissionId } = await params;
    const cameraRepository = createPrismaCameraRepository(auth.prisma);

    const result = await removeCameraPermission(
      {
        actor: { id: auth.actor.id },
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
    return mapDomainErrorToResponse(error, {
      method: "DELETE",
      path: "/api/communities/[communityId]/cameras/[cameraId]/permissions/[permissionId]",
    });
  }
}
