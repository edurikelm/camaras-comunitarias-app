import { NextRequest, NextResponse } from "next/server";

import { requirePlatformAdmin } from "@/lib/api/auth-prelude";
import { mapDomainErrorToResponse } from "@/lib/api/domain-error-mapper";
import { createPrismaPlatformCommunityRepository } from "@/infrastructure/prisma/platform-community-repository";
import { createCommunityWithFirstAdmin } from "@/domain/platform/create-community-with-first-admin";

export const dynamic = "force-dynamic";

type RequestBody = {
  community: {
    name: string;
    address?: string;
  };
  firstAdmin: {
    authProviderId: string;
    email: string;
    name?: string;
  };
};

export async function POST(request: NextRequest) {
  const auth = await requirePlatformAdmin(request);
  if (!auth.ok) return auth.response;

  try {
    // 3. Parse and validate request body
    const body: RequestBody = await request.json();

    if (!body.community?.name || typeof body.community.name !== "string") {
      return NextResponse.json(
        { error: "community.name is required and must be a string" },
        { status: 400 },
      );
    }

    if (!body.firstAdmin?.authProviderId || typeof body.firstAdmin.authProviderId !== "string") {
      return NextResponse.json(
        { error: "firstAdmin.authProviderId is required" },
        { status: 400 },
      );
    }

    if (!body.firstAdmin?.email || typeof body.firstAdmin.email !== "string") {
      return NextResponse.json(
        { error: "firstAdmin.email is required" },
        { status: 400 },
      );
    }

    // 4. Execute domain service
    const repository = createPrismaPlatformCommunityRepository(auth.prisma);

    const result = await createCommunityWithFirstAdmin(
      {
        actor: {
          id: auth.actor.id,
          platformRole: auth.actor.platformRole,
        },
        community: {
          name: body.community.name,
          address: body.community.address ?? null,
        },
        firstAdmin: {
          authProviderId: body.firstAdmin.authProviderId,
          email: body.firstAdmin.email,
          name: body.firstAdmin.name ?? null,
        },
      },
      { repository },
    );

    // 5. Respond 201
    return NextResponse.json(
      {
        data: {
          community: result.community,
          firstAdminUser: result.firstAdminUser,
          firstAdminMember: result.firstAdminMember,
        },
      },
      { status: 201 },
    );
  } catch (error) {
    return mapDomainErrorToResponse(error, {
      method: "POST",
      path: "/api/platform/communities",
    });
  }
}
