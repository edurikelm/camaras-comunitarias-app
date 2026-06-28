import { NextRequest, NextResponse } from "next/server";

import { getPrisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

type RequestBody = {
  name: string;
  authUserId: string;
  email: string;
};

export async function POST(request: NextRequest) {
  try {
    // 1. Parse request body
    const body: RequestBody = await request.json();

    if (!body.name || typeof body.name !== "string" || body.name.trim().length === 0) {
      return NextResponse.json(
        { error: "name is required and must be a non-empty string" },
        { status: 400 },
      );
    }

    if (!body.authUserId || typeof body.authUserId !== "string") {
      return NextResponse.json(
        { error: "authUserId is required" },
        { status: 400 },
      );
    }

    if (!body.email || typeof body.email !== "string") {
      return NextResponse.json(
        { error: "email is required" },
        { status: 400 },
      );
    }

    // 2. Check if the user already exists in the local database
    const prisma = getPrisma();
    const existingUser = await prisma.user.findUnique({
      where: { authProviderId: body.authUserId },
      select: { id: true },
    });

    if (existingUser) {
      return NextResponse.json(
        { error: "User already exists" },
        { status: 409 },
      );
    }

    // 3. Create the User record in the local database
    const newUser = await prisma.user.create({
      data: {
        authProviderId: body.authUserId,
        email: body.email.trim().toLowerCase(),
        name: body.name.trim(),
      },
      select: {
        id: true,
        authProviderId: true,
        email: true,
        name: true,
        createdAt: true,
      },
    });

    return NextResponse.json({ data: { user: newUser } }, { status: 201 });
  } catch (error) {
    console.error("[POST /api/register] Unexpected error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
