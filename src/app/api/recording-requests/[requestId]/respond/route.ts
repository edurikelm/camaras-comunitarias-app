import { NextRequest, NextResponse } from "next/server";

import { requireAuthenticatedUser } from "@/lib/api/auth-prelude";
import { createPrismaRecordingRequestRepository } from "@/infrastructure/prisma/recording-request-repository";
import { createPrismaAuditLogAdapter } from "@/infrastructure/prisma/audit-log-adapter";
import { mapDomainErrorToResponse } from "@/lib/api/domain-error-mapper";
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
  const auth = await requireAuthenticatedUser(request);
  if (!auth.ok) return auth.response;

  try {
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
    const auditLog = createPrismaAuditLogAdapter(auth.prisma);
    const recordingRequestRepository =
      createPrismaRecordingRequestRepository(auth.prisma, { auditLog });

    const result = await respondRecordingRequest(
      {
        actor: { id: auth.actor.id },
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
    return mapDomainErrorToResponse(error, {
      method: "PATCH",
      path: "/api/recording-requests/[requestId]/respond",
    });
  }
}
