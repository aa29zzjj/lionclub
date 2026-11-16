import { resolve } from "node:path";
import { PrismaClient } from "@prisma/client";
import { getAppSecrets } from "./secrets";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

let prismaPromise: Promise<PrismaClient> | undefined;

function reviewDatabaseTls(url: string): string {
  if (process.env.ISOLATED_APP_REVIEW_ENABLED !== "true") return url;
  const database = new URL(url);
  if (!database.hostname.endsWith(".us-east-2.rds.amazonaws.com")) return url;

  database.searchParams.set("sslmode", "require");
  database.searchParams.set("sslaccept", "strict");
  database.searchParams.set("sslcert", resolve("certificates/aws-rds-us-east-2-root.pem"));
  return database.href;
}

export function getPrisma(): Promise<PrismaClient> {
  if (globalForPrisma.prisma) return Promise.resolve(globalForPrisma.prisma);
  if (!prismaPromise) {
    prismaPromise = getAppSecrets().then(({ DATABASE_URL }) => {
      const client = new PrismaClient({ datasources: { db: { url: reviewDatabaseTls(DATABASE_URL) } } });
      if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = client;
      return client;
    });
  }
  return prismaPromise;
}
