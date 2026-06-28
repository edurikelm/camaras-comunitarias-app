import { NextRequest, NextResponse } from "next/server";

import { requireAuthenticatedUser } from "@/lib/api/auth-prelude";
import { createPrismaRecordingRequestRepository } from "@/infrastructure/prisma/recording-request-repository";
import { mapDomainErrorToResponse } from "@/lib/api/domain-error-mapper";
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
  const auth = await requireAuthenticatedUser(request);
  if (!auth.ok) return auth.response;

  try {
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
      createPrismaRecordingRequestRepository(auth.prisma);

    const result = await createRecordingRequest(
      {
        actor: { id: auth.actor.id },
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
    return mapDomainErrorToResponse(error, {
      method: "POST",
      path: "/api/incidents/[incidentId]/recording-requests",
    });
  }
}
