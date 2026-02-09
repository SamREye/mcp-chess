import fs from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";

const migrationSql = path.resolve("prisma/migrations/0001_init/migration.sql");
const mode = process.argv[2] ?? "init";
const requiredTables = [
  "User",
  "Game",
  "Move",
  "ChatMessage",
  "Invite",
  "Account",
  "Session",
  "VerificationToken"
];

if (!fs.existsSync(migrationSql)) {
  console.error(`Missing migration SQL: ${migrationSql}`);
  process.exit(1);
}

const databaseUrl = resolveDatabaseUrl();

if (!databaseUrl.startsWith("file:")) {
  if (mode === "init") {
    console.log(
      `Skipping sqlite init for non-sqlite DATABASE_URL (${redactDatabaseUrl(databaseUrl)}).`
    );
    process.exit(0);
  }
  throw new Error(
    `Only sqlite file URLs are supported for db:${mode}. Got: ${redactDatabaseUrl(databaseUrl)}`
  );
}

const dbPath = sqlitePathFromUrl(databaseUrl);

if (mode === "reset") {
  try {
    fs.unlinkSync(dbPath);
  } catch (error) {
    if (!(error && typeof error === "object" && error.code === "ENOENT")) {
      throw error;
    }
  }
}

fs.mkdirSync(path.dirname(dbPath), { recursive: true });

const prisma = new PrismaClient({
  datasources: {
    db: { url: databaseUrl }
  }
});

try {
  if (await hasRequiredTables(prisma, requiredTables)) {
    console.log(`DB already initialized: ${dbPath}`);
    process.exit(0);
  }

  await applyMigrationSql(prisma, migrationSql);
  console.log(`DB initialized: ${dbPath}`);
} finally {
  await prisma.$disconnect();
}

function resolveDatabaseUrl() {
  if (process.env.DATABASE_URL) {
    return process.env.DATABASE_URL;
  }

  const localEnv = readEnvFile(path.resolve(".env.local"));
  if (localEnv.DATABASE_URL) {
    return localEnv.DATABASE_URL;
  }

  const env = readEnvFile(path.resolve(".env"));
  if (env.DATABASE_URL) {
    return env.DATABASE_URL;
  }

  throw new Error("DATABASE_URL is not set in environment, .env.local, or .env");
}

function sqlitePathFromUrl(url) {
  const target = url.slice("file:".length);

  if (target.startsWith("//")) {
    return target.slice(1);
  }

  if (target.startsWith("/")) {
    return target;
  }

  return path.resolve(process.cwd(), target);
}

async function hasRequiredTables(prisma, expectedTables) {
  const quoted = expectedTables.map((name) => `'${name.replace(/'/g, "''")}'`).join(", ");
  const rows = await prisma.$queryRawUnsafe(
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

  return expectedTables.every((name) => found.has(name));
}

async function applyMigrationSql(prisma, sqlFilePath) {
  const text = fs.readFileSync(sqlFilePath, "utf8");
  const statements = splitStatements(text);

  for (const statement of statements) {
    const normalized = toIdempotentDdl(statement);
    await prisma.$executeRawUnsafe(normalized);
  }
}

function splitStatements(sql) {
  const withoutCommentLines = sql
    .split(/\r?\n/)
    .filter((line) => !line.trim().startsWith("--"))
    .join("\n");

  return withoutCommentLines
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean);
}

function toIdempotentDdl(statement) {
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

function readEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};

  const text = fs.readFileSync(filePath, "utf8");
  const out = {};

  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const idx = trimmed.indexOf("=");
    if (idx <= 0) continue;

    const key = trimmed.slice(0, idx).trim();
    let value = trimmed.slice(idx + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    out[key] = value;
  }

  return out;
}

function redactDatabaseUrl(url) {
  return url.length > 64 ? `${url.slice(0, 64)}...` : url;
}
