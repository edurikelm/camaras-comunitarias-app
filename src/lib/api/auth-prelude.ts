import { NextRequest, NextResponse } from "next/server";
import type { PrismaClient } from "@/generated/prisma/client";
import { PlatformRole } from "@/generated/prisma/enums";
import { authenticateRequest } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";

export type AuthPreludeOk<T extends object = {}> = {
  ok: true;
  actor: { id: string } & T;
  prisma: PrismaClient;
};

export type AuthPreludeErr = {
  ok: false;
  response: NextResponse;
};

export type AuthPreludeResult<T extends object = {}> =
  | AuthPreludeOk<T>
  | AuthPreludeErr;

async function resolveActorWithPlatformRole(
  request: NextRequest,
): Promise<AuthPreludeResult<{ platformRole: PlatformRole }>> {
  // 1. Authenticate via Supabase (cookies or Bearer token)
  const authUser = await authenticateRequest(request);
  if (!authUser) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }

  // 2. Get Prisma singleton
  const prisma = getPrisma();

  // 3. Look up the platform user by authProviderId
  const user = await prisma.user.findUnique({
    where: { authProviderId: authUser.id },
    select: { id: true, platformRole: true },
  });

  if (!user) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    };
  }

  // 4. Verify the user is PLATFORM_ADMIN
  if (user.platformRole !== PlatformRole.PLATFORM_ADMIN) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    };
  }

  return {
    ok: true,
    actor: { id: user.id, platformRole: user.platformRole },
    prisma,
  };
}

async function resolveActorWithoutPlatformRole(
  request: NextRequest,
): Promise<AuthPreludeResult> {
  // 1. Authenticate via Supabase (cookies or Bearer token)
  const authUser = await authenticateRequest(request);
  if (!authUser) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }

  // 2. Get Prisma singleton
  const prisma = getPrisma();

  // 3. Look up the platform user by authProviderId
  const user = await prisma.user.findUnique({
    where: { authProviderId: authUser.id },
    select: { id: true },
  });

  if (!user) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    };
  }

  return {
    ok: true,
    actor: { id: user.id },
    prisma,
  };
}

export async function requireAuthenticatedUser(
  request: NextRequest,
): Promise<AuthPreludeResult> {
  return resolveActorWithoutPlatformRole(request);
}

export async function requirePlatformAdmin(
  request: NextRequest,
): Promise<AuthPreludeResult<{ platformRole: PlatformRole }>> {
  return resolveActorWithPlatformRole(request);
}
