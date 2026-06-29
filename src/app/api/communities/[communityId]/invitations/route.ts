import { NextRequest, NextResponse } from "next/server";

import { requireAuthenticatedUser } from "@/lib/api/auth-prelude";
import { createPrismaCommunityMembershipRepository } from "@/infrastructure/prisma/community-membership-repository";
import { mapDomainErrorToResponse } from "@/lib/api/domain-error-mapper";
import { createCommunityInvitation } from "@/domain/community/invitations/create-community-invitation";

export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ communityId: string }> },
) {
  const auth = await requireAuthenticatedUser(request);
  if (!auth.ok) return auth.response;

  try {
    // 3. Execute domain service
    const { communityId } = await params;
    const repository = createPrismaCommunityMembershipRepository(auth.prisma);

    const result = await createCommunityInvitation(
      {
        actor: { id: auth.actor.id },
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
    return mapDomainErrorToResponse(error, {
      method: "POST",
      path: "/api/communities/[communityId]/invitations",
    });
  }
}
