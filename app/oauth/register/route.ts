import { randomBytes } from "node:crypto";

import { getBaseUrl, validateRedirectUri } from "@/lib/mcp-oauth";

const ALLOWED_CLIENT_ID_CHARS = /^[a-zA-Z0-9._-]{16,64}$/;

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (process.env.MCP_OAUTH_ALLOWED_CLIENT_IDS?.trim()) {
    return Response.json(
      {
        error: "unauthorized_client",
        error_description:
          "Dynamic client registration is disabled while MCP_OAUTH_ALLOWED_CLIENT_IDS is set."
      },
      { status: 403 }
    );
  }

  let body: { client_name?: string; redirect_uris?: unknown; grant_types?: unknown };
  try {
    body = (await req.json()) as {
      client_name?: string;
      redirect_uris?: unknown;
      grant_types?: unknown;
    };
  } catch {
    return Response.json(
      {
        error: "invalid_request",
        error_description: "Request body must be valid JSON"
      },
      { status: 400 }
    );
  }

  const clientName = typeof body.client_name === "string" ? body.client_name.slice(0, 120) : "MCP Client";

  const redirectUris = normalizeRedirectUris(body.redirect_uris);
  if (!redirectUris) {
    return Response.json(
      {
        error: "invalid_request",
        error_description: "Each redirect_uri must be a valid HTTP(S) URL without a fragment"
      },
      { status: 400 }
    );
  }

  const grants = normalizeGrants(body.grant_types);
  if (!grants || !grants.includes("authorization_code")) {
    return Response.json(
      {
        error: "invalid_request",
        error_description: "Only authorization_code grant is supported"
      },
      { status: 400 }
    );
  }

  const baseUrl = getBaseUrl(req);
  const issuedAt = Math.floor(Date.now() / 1000);
  const clientId = randomClientId();
  const clientSecret = randomToken(32);

  return Response.json({
    client_id: clientId,
    client_secret: clientSecret,
    client_id_issued_at: issuedAt,
    client_secret_expires_at: 0,
    redirect_uris: redirectUris,
    client_name: clientName,
    token_endpoint_auth_method: "none",
    grant_types: ["authorization_code"],
    response_types: ["code"],
    scope: "mcp:tools",
    registration_client_uri: `${baseUrl}/oauth/client/${clientId}`,
    registration_access_token: randomToken(24),
    client_uri: baseUrl,
    logo_uri: baseUrl,
    application_type: "web"
  });
}

export async function OPTIONS() {
  return new Response(null, { status: 204 });
}

function normalizeRedirectUris(raw: unknown) {
  if (raw === undefined) {
    return [];
  }

  if (!Array.isArray(raw)) {
    return null;
  }

  const redirectUris = raw
    .map((value) => (typeof value === "string" ? value.trim() : ""))
    .filter(Boolean);

  if (!redirectUris.length || redirectUris.some((value) => !validateRedirectUri(value))) {
    return null;
  }

  return redirectUris;
}

function normalizeGrants(raw: unknown) {
  if (raw === undefined) {
    return ["authorization_code"];
  }

  if (!Array.isArray(raw)) {
    return null;
  }

  const grants = raw
    .map((value) => (typeof value === "string" ? value.trim() : ""))
    .filter(Boolean);

  if (!grants.length) {
    return null;
  }

  return grants;
}

function randomClientId() {
  let candidate = randomToken(32).replace(/[-_]/g, "");
  if (!ALLOWED_CLIENT_ID_CHARS.test(candidate)) {
    candidate = `mcp_client_${randomToken(24)}`.slice(0, 48);
  }

  return candidate;
}

function randomToken(length = 32) {
  return randomBytes(length).toString("base64url");
}

