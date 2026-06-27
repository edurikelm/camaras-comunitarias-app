import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

function createPrismaClient() {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error("DATABASE_URL is required to initialize PrismaClient");
  }

  const adapter = new PrismaPg({ connectionString });

  return new PrismaClient({ adapter });
}

/**
 * Returns the singleton PrismaClient, creating it lazily on first call.
 * Lazy initialization avoids requiring DATABASE_URL at module import time.
 */
export function getPrisma(): PrismaClient {
  if (!globalForPrisma.prisma) {
    globalForPrisma.prisma = createPrismaClient();
  }
  return globalForPrisma.prisma;
}
