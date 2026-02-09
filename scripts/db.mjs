import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const migrationSql = path.resolve("prisma/migrations/0001_init/migration.sql");
const mode = process.argv[2] ?? "init";

if (!fs.existsSync(migrationSql)) {
  console.error(`Missing migration SQL: ${migrationSql}`);
  process.exit(1);
}

const databaseUrl = resolveDatabaseUrl();
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

if (hasUserTable(dbPath)) {
  console.log(`DB already initialized: ${dbPath}`);
  process.exit(0);
}

execFileSync("sqlite3", [dbPath, `.read ${migrationSql}`], { stdio: "inherit" });
console.log(`DB initialized: ${dbPath}`);

function hasUserTable(targetDbPath) {
  const output = execFileSync(
    "sqlite3",
    [
      targetDbPath,
      "SELECT name FROM sqlite_master WHERE type='table' AND name='User';"
    ],
    { encoding: "utf8" }
  );

  return output.trim() === "User";
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
  if (!url.startsWith("file:")) {
    throw new Error(`Only sqlite file URLs are supported for db scripts. Got: ${url}`);
  }

  const target = url.slice("file:".length);

  if (target.startsWith("//")) {
    return target.slice(1);
  }

  if (target.startsWith("/")) {
    return target;
  }

  return path.resolve(process.cwd(), target);
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
