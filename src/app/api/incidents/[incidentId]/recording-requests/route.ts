import { NextRequest, NextResponse } from "next/server";

import { authenticateRequest } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { createPrismaRecordingRequestRepository } from "@/infrastructure/prisma/recording-request-repository";
import {
  CommunityAuthorizationError,
  CommunityInvariantError,
} from "@/domain/community/errors";
import { createRecordingRequest } from "@/domain/community/recording/create-recording-request";

export const dynamic = "force-dynamic";

type RequestBody = {
  cameraId: string;
  startTime: string;
  endTime: string;
  reason: string;
};

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ incidentId: string }> },
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

    if (!body.cameraId || !body.cameraId.trim()) {
      return NextResponse.json(
        { error: "cameraId is required" },
        { status: 400 },
      );
    }

    if (!body.reason || !body.reason.trim()) {
      return NextResponse.json(
        { error: "reason is required" },
        { status: 400 },
      );
    }

    let startTime: Date;
    let endTime: Date;

    try {
      startTime = new Date(body.startTime);
      if (isNaN(startTime.getTime())) {
        throw new Error("Invalid date");
      }
    } catch {
      return NextResponse.json(
        { error: "startTime must be a valid ISO date string" },
        { status: 400 },
      );
    }

    try {
      endTime = new Date(body.endTime);
      if (isNaN(endTime.getTime())) {
        throw new Error("Invalid date");
      }
    } catch {
      return NextResponse.json(
        { error: "endTime must be a valid ISO date string" },
        { status: 400 },
      );
    }

    if (startTime >= endTime) {
      return NextResponse.json(
        { error: "startTime must be before endTime" },
        { status: 400 },
      );
    }

    const maxMs = 30 * 60 * 1000;
    if (endTime.getTime() - startTime.getTime() > maxMs) {
      return NextResponse.json(
        { error: "Time range cannot exceed 30 minutes" },
        { status: 400 },
      );
    }

    // 4. Execute domain service
    const { incidentId } = await params;
    const recordingRequestRepository =
      createPrismaRecordingRequestRepository(prisma);

    const result = await createRecordingRequest(
      {
        actor: { id: platformUser.id },
        recordingRequest: {
          incidentId,
          cameraId: body.cameraId.trim(),
          startTime,
          endTime,
          reason: body.reason.trim(),
        },
      },
      { recordingRequestRepository },
    );

    // 5. Respond 201
    return NextResponse.json(
      { recordingRequest: result.recordingRequest },
      { status: 201 },
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
      "[POST /api/incidents/[incidentId]/recording-requests] Unexpected error:",
      error,
    );
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
