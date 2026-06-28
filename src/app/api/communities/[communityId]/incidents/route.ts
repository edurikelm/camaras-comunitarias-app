import { NextRequest, NextResponse } from "next/server";

import { authenticateRequest } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { createPrismaIncidentRepository } from "@/infrastructure/prisma/incident-repository";
import { mapDomainErrorToResponse } from "@/lib/api/domain-error-mapper";
import { createIncident } from "@/domain/community/incident/create-incident";
import { IncidentType } from "@/generated/prisma/enums";

export const dynamic = "force-dynamic";

type RequestBody = {
  type: IncidentType;
  description: string;
  location?: string;
  sectorId?: string;
};

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ communityId: string }> },
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

    if (!body.type) {
      return NextResponse.json(
        { error: "type is required" },
        { status: 400 },
      );
    }

    const validTypes: string[] = Object.values(IncidentType);
    if (!validTypes.includes(body.type)) {
      return NextResponse.json(
        { error: `Invalid incident type: ${body.type}` },
        { status: 400 },
      );
    }

    if (!body.description || !body.description.trim()) {
      return NextResponse.json(
        { error: "description is required" },
        { status: 400 },
      );
    }

    if (
      body.sectorId !== undefined &&
      body.sectorId !== null &&
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        body.sectorId,
      )
    ) {
      return NextResponse.json(
        { error: "sectorId must be a valid UUID" },
        { status: 400 },
      );
    }

    // 4. Execute domain service
    const { communityId } = await params;
    const incidentRepository = createPrismaIncidentRepository(prisma);

    const result = await createIncident(
      {
        actor: { id: platformUser.id },
        communityId,
        incident: {
          type: body.type,
          description: body.description,
          location: body.location,
          sectorId: body.sectorId,
        },
      },
      { incidentRepository },
    );

    // 5. Respond 201
    return NextResponse.json(
      {
        incident: result.incident,
        alert: result.alert,
      },
      { status: 201 },
    );
  } catch (error) {
    return mapDomainErrorToResponse(error, {
      method: "POST",
      path: "/api/communities/[communityId]/incidents",
    });
  }
}
