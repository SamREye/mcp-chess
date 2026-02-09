import { PrismaClient } from "@prisma/client";
import fs from "node:fs";
import path from "node:path";

declare global {
  // eslint-disable-next-line no-var
  var prisma: PrismaClient | undefined;
  // eslint-disable-next-line no-var
  var dbReadyPromise: Promise<void> | undefined;
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

const requiredSqliteTables = [
  "User",
  "Game",
  "Move",
  "ChatMessage",
  "Invite",
  "Account",
  "Session",
  "VerificationToken",
  "OAuthCode",
  "OAuthAccessToken"
];

export async function ensureDbReady() {
  if (global.dbReadyPromise) {
    return global.dbReadyPromise;
  }

  global.dbReadyPromise = ensureDbReadyInner().catch((error) => {
    global.dbReadyPromise = undefined;
    throw error;
  });

  return global.dbReadyPromise;
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

async function ensureDbReadyInner() {
  const dbUrl = normalizeDatabaseUrl(process.env.DATABASE_URL);
  if (!dbUrl || !dbUrl.startsWith("file:")) {
    return;
  }

  if (await hasRequiredTables()) {
    return;
  }

  const migrationPath = path.resolve("prisma/migrations/0001_init/migration.sql");
  if (!fs.existsSync(migrationPath)) {
    throw new Error(`Missing migration SQL file at ${migrationPath}`);
  }

  const sql = fs.readFileSync(migrationPath, "utf8");
  const statements = splitStatements(sql).map(toIdempotentDdl);

  for (const statement of statements) {
    await db.$executeRawUnsafe(statement);
  }
}

async function hasRequiredTables() {
  const quoted = requiredSqliteTables
    .map((table) => `'${table.replace(/'/g, "''")}'`)
    .join(", ");
  const rows = await db.$queryRawUnsafe(
    `SELECT name FROM sqlite_master WHERE type='table' AND name IN (${quoted});`
  );

  const found = new Set(
    Array.isArray(rows)
      ? rows
          .map((row) =>
            row && typeof row === "object" && "name" in row ? String(row.name) : null
          )
          .filter(Boolean)
      : []
  );

  return requiredSqliteTables.every((table) => found.has(table));
}

function splitStatements(sql: string) {
  const withoutCommentLines = sql
    .split(/\r?\n/)
    .filter((line) => !line.trim().startsWith("--"))
    .join("\n");

  return withoutCommentLines
    .split(";")
    .map((statement) => statement.trim())
    .filter(Boolean);
}

function toIdempotentDdl(statement: string) {
  if (/^CREATE TABLE\s+/i.test(statement)) {
    return statement.replace(/^CREATE TABLE\s+/i, "CREATE TABLE IF NOT EXISTS ");
  }

  if (/^CREATE UNIQUE INDEX\s+/i.test(statement)) {
    return statement.replace(
      /^CREATE UNIQUE INDEX\s+/i,
      "CREATE UNIQUE INDEX IF NOT EXISTS "
    );
  }

  if (/^CREATE INDEX\s+/i.test(statement)) {
    return statement.replace(/^CREATE INDEX\s+/i, "CREATE INDEX IF NOT EXISTS ");
  }

  return statement;
}
