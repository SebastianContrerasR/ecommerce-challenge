import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client.js";

declare global {
  var prismaClient: PrismaClient | undefined;
}

function createPrismaClient(databaseUrl?: string): PrismaClient {
  const connectionString = databaseUrl ?? process.env["DATABASE_URL"];
  const adapter = new PrismaPg({ connectionString: connectionString ?? "" });
  return new PrismaClient({ adapter });
}

export function getPrismaClient(databaseUrl?: string): PrismaClient {
  if (globalThis.prismaClient === undefined) {
    globalThis.prismaClient = createPrismaClient(databaseUrl);
  }
  return globalThis.prismaClient;
}

export async function disconnectPrismaClient(): Promise<void> {
  if (globalThis.prismaClient !== undefined) {
    await globalThis.prismaClient.$disconnect();
    globalThis.prismaClient = undefined;
  }
}
