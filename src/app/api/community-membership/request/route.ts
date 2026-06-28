import { NextRequest, NextResponse } from "next/server";

import { authenticateRequest } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { createPrismaCommunityMembershipRepository } from "@/infrastructure/prisma/community-membership-repository";
import { mapDomainErrorToResponse } from "@/lib/api/domain-error-mapper";
import { requestCommunityMembership } from "@/domain/community/membership/request-community-membership";

export const dynamic = "force-dynamic";

type RequestBody = {
  code: string;
};

export async function POST(request: NextRequest) {
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

    if (!body.code || typeof body.code !== "string") {
      return NextResponse.json(
        { error: "code is required and must be a string" },
        { status: 400 },
      );
    }

    // 4. Execute domain service
    const repository = createPrismaCommunityMembershipRepository(prisma);

    const result = await requestCommunityMembership(
      {
        userId: platformUser.id,
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
