import { createHash, randomBytes } from "node:crypto";

import { db } from "@/lib/db";

const OAUTH_SCOPE = "mcp:tools";
const CODE_TTL_SECONDS = 5 * 60;
const ACCESS_TOKEN_TTL_SECONDS = 60 * 60;

export function getMcpScope() {
  return OAUTH_SCOPE;
}

export function getBaseUrl(req: Request) {
  const configuredPublicBase =
    normalizeConfiguredBaseUrl(process.env.MCP_PUBLIC_URL) ||
    normalizeConfiguredBaseUrl(process.env.NEXTAUTH_URL);
  if (configuredPublicBase) {
    return configuredPublicBase;
  }

  const url = new URL(req.url);
  const forwardedProto = req.headers.get("x-forwarded-proto");
  const forwardedHost = req.headers.get("x-forwarded-host");
  const host = forwardedHost ?? req.headers.get("host");

  if (forwardedProto && host) {
    return `${forwardedProto}://${host}`;
  }

  return url.origin;
}

function normalizeConfiguredBaseUrl(value: string | undefined) {
  const trimmed = value?.trim();
  if (!trimmed) {
    return null;
  }

  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;

  try {
    const parsed = new URL(withScheme);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      return null;
    }

    const pathname = parsed.pathname === "/" ? "" : parsed.pathname.replace(/\/+$/, "");
    return `${parsed.origin}${pathname}`;
  } catch {
    return null;
  }
}

export function getProtectedResourceMetadata(baseUrl: string) {
  return {
    resource: `${baseUrl}/api/mcp`,
    authorization_servers: [baseUrl],
    bearer_methods_supported: ["header"],
    scopes_supported: [OAUTH_SCOPE]
  };
}

export function getAuthorizationServerMetadata(baseUrl: string) {
  return {
    issuer: baseUrl,
    authorization_endpoint: `${baseUrl}/oauth/authorize`,
    token_endpoint: `${baseUrl}/oauth/token`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code"],
    token_endpoint_auth_methods_supported: ["none"],
    code_challenge_methods_supported: ["S256", "plain"],
    scopes_supported: [OAUTH_SCOPE]
  };
}

export function getWwwAuthenticateHeader(baseUrl: string) {
  const resourceMetadataUrl = `${baseUrl}/.well-known/oauth-protected-resource`;
  const authorizationUri = `${baseUrl}/oauth/authorize`;
  return `Bearer realm="mcp-chess", authorization_uri="${authorizationUri}", resource_metadata="${resourceMetadataUrl}", scope="${OAUTH_SCOPE}"`;
}

export function assertAllowedClientId(clientId: string) {
  const allowed = (process.env.MCP_OAUTH_ALLOWED_CLIENT_IDS ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  if (!allowed.length) {
    return;
  }

  if (!allowed.includes(clientId)) {
    throw new Error("unauthorized_client");
  }
}

export function isValidPkceVerifier(value: string) {
  return /^[A-Za-z0-9\-._~]{43,128}$/.test(value);
}

export function isValidCodeChallenge(value: string) {
  return /^[A-Za-z0-9\-._~]{43,128}$/.test(value);
}

export function validateRedirectUri(redirectUri: string) {
  try {
    const parsed = new URL(redirectUri);
    if (!["https:", "http:"].includes(parsed.protocol)) {
      return false;
    }
    if (parsed.hash) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

export async function createAuthorizationCode(input: {
  userId: string;
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  codeChallengeMethod: "S256" | "plain";
  scope?: string;
  resource?: string;
}) {
  const code = randomToken();
  const codeHash = sha256(code);
  const expiresAt = new Date(Date.now() + CODE_TTL_SECONDS * 1000);

  await db.oAuthCode.create({
    data: {
      codeHash,
      userId: input.userId,
      clientId: input.clientId,
      redirectUri: input.redirectUri,
      codeChallenge: input.codeChallenge,
      codeChallengeMethod: input.codeChallengeMethod,
      scope: input.scope ?? OAUTH_SCOPE,
      resource: input.resource ?? null,
      expiresAt
    }
  });

  return code;
}

export async function exchangeAuthorizationCode(input: {
  code: string;
  clientId: string;
  redirectUri: string;
  codeVerifier: string;
}) {
  const codeHash = sha256(input.code);

  const authCode = await db.oAuthCode.findUnique({
    where: { codeHash },
    select: {
      id: true,
      userId: true,
      clientId: true,
      redirectUri: true,
      scope: true,
      resource: true,
      codeChallenge: true,
      codeChallengeMethod: true,
      expiresAt: true,
      usedAt: true
    }
  });

  if (!authCode) {
    throw new Error("invalid_grant");
  }

  if (authCode.usedAt || authCode.expiresAt.getTime() <= Date.now()) {
    throw new Error("invalid_grant");
  }

  if (authCode.clientId !== input.clientId || authCode.redirectUri !== input.redirectUri) {
    throw new Error("invalid_grant");
  }

  if (!verifyPkce(authCode.codeChallenge, authCode.codeChallengeMethod, input.codeVerifier)) {
    throw new Error("invalid_grant");
  }

  const token = randomToken(48);
  const tokenHash = sha256(token);
  const expiresAt = new Date(Date.now() + ACCESS_TOKEN_TTL_SECONDS * 1000);

  const updated = await db.oAuthCode.updateMany({
    where: { id: authCode.id, usedAt: null },
    data: { usedAt: new Date() }
  });

  if (!updated.count) {
    throw new Error("invalid_grant");
  }

  await db.oAuthAccessToken.create({
    data: {
      tokenHash,
      userId: authCode.userId,
      clientId: authCode.clientId,
      scope: authCode.scope,
      resource: authCode.resource,
      expiresAt
    }
  });

  return {
    accessToken: token,
    scope: authCode.scope ?? OAUTH_SCOPE,
    expiresIn: ACCESS_TOKEN_TTL_SECONDS
  };
}

export async function getUserIdFromBearerToken(authHeader: string | null) {
  const token = extractBearerToken(authHeader);
  if (!token) {
    return null;
  }

  const tokenHash = sha256(token);
  const record = await db.oAuthAccessToken.findUnique({
    where: { tokenHash },
    select: { userId: true, expiresAt: true }
  });

  if (!record || record.expiresAt.getTime() <= Date.now()) {
    return null;
  }

  await db.oAuthAccessToken
    .update({
      where: { tokenHash },
      data: { lastUsedAt: new Date() }
    })
    .catch(() => undefined);

  return record.userId;
}

function extractBearerToken(authHeader: string | null) {
  if (!authHeader) {
    return null;
  }

  const [scheme, ...rest] = authHeader.trim().split(/\s+/);
  if (!scheme || scheme.toLowerCase() !== "bearer") {
    return null;
  }

  const token = rest.join(" ").trim();
  return token || null;
}

function verifyPkce(
  challenge: string,
  method: string,
  verifier: string
): boolean {
  if (method === "plain") {
    return verifier === challenge;
  }

  if (method === "S256") {
    return sha256(verifier) === challenge;
  }

  return false;
}

function randomToken(bytes = 32) {
  return randomBytes(bytes).toString("base64url");
}

function sha256(value: string) {
  return createHash("sha256").update(value).digest("base64url");
}
