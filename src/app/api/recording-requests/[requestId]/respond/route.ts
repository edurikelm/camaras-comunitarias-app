import { NextRequest, NextResponse } from "next/server";

import { authenticateRequest } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { createPrismaRecordingRequestRepository } from "@/infrastructure/prisma/recording-request-repository";
import {
  CommunityAuthorizationError,
  CommunityInvariantError,
} from "@/domain/community/errors";
import { respondRecordingRequest } from "@/domain/community/recording/respond-recording-request";

export const dynamic = "force-dynamic";

type RequestBody = {
  action: "ACCEPT" | "REJECT";
  ownerComment?: string;
};

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ requestId: string }> },
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

    // 3. Parse and validate body
    const body: RequestBody = await request.json();

    if (!body.action || !["ACCEPT", "REJECT"].includes(body.action)) {
      return NextResponse.json(
        { error: "action must be ACCEPT or REJECT" },
        { status: 400 },
      );
    }

    // 4. Execute domain service
    const { requestId } = await params;
    const recordingRequestRepository =
      createPrismaRecordingRequestRepository(prisma);

    const result = await respondRecordingRequest(
      {
        actor: { id: platformUser.id },
        recordingRequestId: requestId,
        action: body.action,
        ownerComment: body.ownerComment,
      },
      { recordingRequestRepository },
    );

    // 5. Respond 200
    return NextResponse.json(
      { recordingRequest: result.recordingRequest },
      { status: 200 },
    );
  } catch (error) {
    if (error instanceof CommunityAuthorizationError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }

    if (error instanceof CommunityInvariantError) {
      const status = error.message.toLowerCase().includes("not found")
        ? 404
        : 400;
      return NextResponse.json({ error: error.message }, { status });
    }

    console.error(
      "[PATCH /api/recording-requests/[requestId]/respond] Unexpected error:",
      error,
    );
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
