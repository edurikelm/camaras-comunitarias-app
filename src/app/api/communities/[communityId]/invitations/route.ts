import { NextRequest, NextResponse } from "next/server";

import { authenticateRequest } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { createPrismaCommunityMembershipRepository } from "@/infrastructure/prisma/community-membership-repository";
import {
  CommunityAuthorizationError,
  CommunityInvariantError,
} from "@/domain/community/errors";
import { createCommunityInvitation } from "@/domain/community/invitations/create-community-invitation";

export const dynamic = "force-dynamic";

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

    // 3. Execute domain service
    const { communityId } = await params;
    const repository = createPrismaCommunityMembershipRepository(prisma);

    const result = await createCommunityInvitation(
      {
        actor: { id: platformUser.id },
        communityId,
      },
      { repository },
    );

    // 4. Respond 201 with plain code
    return NextResponse.json(
      {
        data: {
          plainCode: result.plainCode,
          invitation: result.invitation,
        },
      },
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof CommunityAuthorizationError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }

    if (error instanceof CommunityInvariantError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    console.error(
      "[POST /api/communities/[communityId]/invitations] Unexpected error:",
      error,
    );
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
