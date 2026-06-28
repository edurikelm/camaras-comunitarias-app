import { NextRequest, NextResponse } from "next/server";

import { requireAuthenticatedUser } from "@/lib/api/auth-prelude";
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
  const auth = await requireAuthenticatedUser(request);
  if (!auth.ok) return auth.response;

  try {
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
    const repository = createPrismaCommunityMembershipRepository(auth.prisma);

    const result = await approveCommunityMember(
      {
        actor: { id: auth.actor.id },
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
