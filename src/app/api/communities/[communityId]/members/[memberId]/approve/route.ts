import { NextRequest, NextResponse } from "next/server";

import { authenticateRequest } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { CommunityMemberRole } from "@/generated/prisma/enums";
import { createPrismaCommunityMembershipRepository } from "@/infrastructure/prisma/community-membership-repository";
import { mapDomainErrorToResponse } from "@/lib/api/domain-error-mapper";
import { approveCommunityMember } from "@/domain/community/membership/approve-community-member";

export const dynamic = "force-dynamic";

type RequestBody = {
  role: "NEIGHBOR" | "GUARD";
};

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ communityId: string; memberId: string }> },
) {
  try {
    // 1. Authenticate
    const authUser = await authenticateRequest(request);
    if (!authUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // 2. Look up the user by authProviderId
    const prisma = getPrisma();
    const platformUser = await prisma.user.findUnique({
      where: { authProviderId: authUser.id },
      select: { id: true },
    });

    if (!platformUser) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // 3. Parse request body
    const body: RequestBody = await request.json();

    if (!body.role || !["NEIGHBOR", "GUARD"].includes(body.role)) {
      return NextResponse.json(
        { error: "role is required and must be NEIGHBOR or GUARD" },
        { status: 400 },
      );
    }

    // 4. Execute domain service
    const { communityId, memberId } = await params;
    const repository = createPrismaCommunityMembershipRepository(prisma);

    const result = await approveCommunityMember(
      {
        actor: { id: platformUser.id },
        communityId,
        memberId,
        role: body.role as CommunityMemberRole,
      },
      { repository },
    );

    // 5. Respond 200
    return NextResponse.json({ data: { member: result.member } }, { status: 200 });
  } catch (error) {
    return mapDomainErrorToResponse(error, {
      method: "PATCH",
      path: "/api/communities/[communityId]/members/[memberId]/approve",
    });
  }
}
