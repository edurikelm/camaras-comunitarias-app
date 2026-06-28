import { NextRequest, NextResponse } from "next/server";

import { authenticateRequest } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { createPrismaCommunityMembershipRepository } from "@/infrastructure/prisma/community-membership-repository";
import { mapDomainErrorToResponse } from "@/lib/api/domain-error-mapper";
import { rejectCommunityMember } from "@/domain/community/membership/reject-community-member";

export const dynamic = "force-dynamic";

type RequestBody = {
  reason?: string;
};

export async function POST(
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

    // 3. Parse optional request body
    let reason: string | undefined;
    try {
      const body: RequestBody = await request.json();
      reason = body.reason;
    } catch {
      // Body is optional for rejection
    }

    // 4. Execute domain service
    const { communityId, memberId } = await params;
    const repository = createPrismaCommunityMembershipRepository(prisma);

    const result = await rejectCommunityMember(
      {
        actor: { id: platformUser.id },
        communityId,
        memberId,
        reason,
      },
      { repository },
    );

    // 5. Respond 200
    return NextResponse.json({ data: { member: result.member } }, { status: 200 });
  } catch (error) {
    return mapDomainErrorToResponse(error, {
      method: "POST",
      path: "/api/communities/[communityId]/members/[memberId]/reject",
    });
  }
}
