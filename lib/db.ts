import { PrismaClient } from "@prisma/client";
import path from "node:path";

declare global {
  // eslint-disable-next-line no-var
  var prisma: PrismaClient | undefined;
}

export const db =
  global.prisma ||
  new PrismaClient({
    datasources: {
      db: {
        url: normalizeDatabaseUrl(process.env.DATABASE_URL)
      }
    },
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"]
  });

if (process.env.NODE_ENV !== "production") {
  global.prisma = db;
}

function normalizeDatabaseUrl(rawUrl: string | undefined): string | undefined {
  if (!rawUrl || !rawUrl.startsWith("file:")) {
    return rawUrl;
  }

  const fileTarget = rawUrl.slice("file:".length);

  // Keep absolute sqlite paths as-is.
  if (fileTarget.startsWith("/") || fileTarget.startsWith("//")) {
    return rawUrl;
  }

  // Resolve relative sqlite paths against the app cwd.
  const absolutePath = path.resolve(process.cwd(), fileTarget);
  return `file:${absolutePath}`;
}
