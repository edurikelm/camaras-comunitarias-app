import { NextRequest, NextResponse } from "next/server";

import { requireAuthenticatedUser } from "@/lib/api/auth-prelude";
import { createPrismaCommunityMembershipRepository } from "@/infrastructure/prisma/community-membership-repository";
import { mapDomainErrorToResponse } from "@/lib/api/domain-error-mapper";
import { requestCommunityMembership } from "@/domain/community/membership/request-community-membership";

export const dynamic = "force-dynamic";

type RequestBody = {
  code: string;
};

export async function POST(request: NextRequest) {
  const auth = await requireAuthenticatedUser(request);
  if (!auth.ok) return auth.response;

  try {
    // 3. Parse request body
    const body: RequestBody = await request.json();

    if (!body.code || typeof body.code !== "string") {
      return NextResponse.json(
        { error: "code is required and must be a string" },
        { status: 400 },
      );
    }

    // 4. Execute domain service
    const repository = createPrismaCommunityMembershipRepository(auth.prisma);

    const result = await requestCommunityMembership(
      {
        userId: auth.actor.id,
        code: body.code,
      },
      { repository },
    );

    // 5. Respond 201
    return NextResponse.json({ data: { member: result.member } }, { status: 201 });
  } catch (error) {
    return mapDomainErrorToResponse(error, {
      method: "POST",
      path: "/api/community-membership/request",
    });
  }
}
