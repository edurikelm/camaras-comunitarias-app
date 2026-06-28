import { NextRequest, NextResponse } from "next/server";

import { requireAuthenticatedUser } from "@/lib/api/auth-prelude";
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
  const auth = await requireAuthenticatedUser(request);
  if (!auth.ok) return auth.response;

  try {
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
    const repository = createPrismaCommunityMembershipRepository(auth.prisma);

    const result = await rejectCommunityMember(
      {
        actor: { id: auth.actor.id },
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
