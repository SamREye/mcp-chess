import { PrismaClient } from "@prisma/client";

declare global {
  // eslint-disable-next-line no-var
  var prisma: PrismaClient | undefined;
  // eslint-disable-next-line no-var
  var dbReadyPromise: Promise<void> | undefined;
}

export const db =
  global.prisma ||
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"]
  });

if (process.env.NODE_ENV !== "production") {
  global.prisma = db;
}

export async function ensureDbReady() {
  if (global.dbReadyPromise) {
    return global.dbReadyPromise;
  }

  global.dbReadyPromise = db.$connect().catch((error) => {
    global.dbReadyPromise = undefined;
    throw error;
  });

  return global.dbReadyPromise;
}
