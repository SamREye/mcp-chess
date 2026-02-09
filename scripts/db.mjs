import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const mode = process.argv[2] ?? "init";

if (!["init", "reset"].includes(mode)) {
  console.error(`Unsupported mode "${mode}". Use "init" or "reset".`);
  process.exit(1);
}

const databaseUrl = resolveDatabaseUrl();
if (!isMongoUrl(databaseUrl)) {
  console.error(
    `DATABASE_URL must be a mongodb connection string after migration. Got: ${redactDatabaseUrl(databaseUrl)}`
  );
  process.exit(1);
}

const args = ["exec", "prisma", "db", "push", "--skip-generate"];
if (mode === "reset") {
  args.push("--force-reset");
}

execFileSync("pnpm", args, {
  stdio: "inherit",
  env: {
    ...process.env,
    DATABASE_URL: databaseUrl
  }
});

function isMongoUrl(url) {
  return /^mongodb(\+srv)?:\/\//i.test(url);
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
