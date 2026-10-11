import { PrismaClient } from "@prisma/client";
import { getAppSecrets } from "./secrets";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

let prismaPromise: Promise<PrismaClient> | undefined;

export function getPrisma(): Promise<PrismaClient> {
  if (globalForPrisma.prisma) return Promise.resolve(globalForPrisma.prisma);
  if (!prismaPromise) {
    prismaPromise = getAppSecrets().then(({ DATABASE_URL }) => {
      const client = new PrismaClient({ datasources: { db: { url: DATABASE_URL } } });
      if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = client;
      return client;
    });
  }
  return prismaPromise;
}
