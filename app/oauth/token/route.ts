import { ensureDbReady } from "@/lib/db";
import {
  assertAllowedClientId,
  exchangeAuthorizationCode,
  isValidPkceVerifier
} from "@/lib/mcp-oauth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function oauthError(req: Request, error: string, description: string, status = 400) {
  return Response.json(
    {
      error,
      error_description: description
    },
    {
      status,
      headers: {
        "cache-control": "no-store",
        pragma: "no-cache",
        ...getCorsHeaders(req)
      }
    }
  );
}

async function getTokenRequestBody(req: Request) {
  const authHeader = req.headers.get("authorization");
  const basicClientId = parseBasicAuthClientId(authHeader);
  const basicClientSecret = parseBasicAuthClientSecret(authHeader);
  const contentType = req.headers.get("content-type") ?? "";

  if (contentType.includes("application/json")) {
    const json = (await req.json()) as Record<string, unknown>;
    return {
      grantType: String(json.grant_type ?? json.grantType ?? ""),
      code: String(json.code ?? ""),
      clientId: String(json.client_id ?? json.clientId ?? basicClientId ?? ""),
      clientSecret: String(
        json.client_secret ?? json.clientSecret ?? basicClientSecret ?? ""
      ),
      redirectUri: String(json.redirect_uri ?? json.redirectUri ?? ""),
      codeVerifier: String(json.code_verifier ?? json.codeVerifier ?? "")
    };
  }

  if (contentType.includes("application/x-www-form-urlencoded")) {
    const text = await req.text();
    const params = new URLSearchParams(text);
    return {
      grantType: String(params.get("grant_type") ?? params.get("grantType") ?? ""),
      code: String(params.get("code") ?? ""),
      clientId: String(params.get("client_id") ?? params.get("clientId") ?? basicClientId ?? ""),
      clientSecret: String(
        params.get("client_secret") ?? params.get("clientSecret") ?? basicClientSecret ?? ""
      ),
      redirectUri: String(params.get("redirect_uri") ?? params.get("redirectUri") ?? ""),
      codeVerifier: String(params.get("code_verifier") ?? params.get("codeVerifier") ?? "")
    };
  }

  const form = await req.formData();
  return {
    grantType: String(form.get("grant_type") ?? form.get("grantType") ?? ""),
    code: String(form.get("code") ?? ""),
    clientId: String(form.get("client_id") ?? form.get("clientId") ?? basicClientId ?? ""),
    clientSecret: String(
      form.get("client_secret") ?? form.get("clientSecret") ?? basicClientSecret ?? ""
    ),
    redirectUri: String(form.get("redirect_uri") ?? form.get("redirectUri") ?? ""),
    codeVerifier: String(form.get("code_verifier") ?? form.get("codeVerifier") ?? "")
  };
}

export async function OPTIONS(req: Request) {
  if (process.env.OAUTH_DEBUG === "true") {
    console.info("[oauth/token] options", {
      origin: req.headers.get("origin"),
      requestMethod: req.headers.get("access-control-request-method"),
      requestHeaders: req.headers.get("access-control-request-headers")
    });
  }

  return new Response(null, {
    status: 204,
    headers: getCorsHeaders(req)
  });
}

export async function POST(req: Request) {
  if (process.env.OAUTH_DEBUG === "true") {
    console.info("[oauth/token] request_start", {
      method: req.method,
      origin: req.headers.get("origin"),
      contentType: req.headers.get("content-type"),
      hasAuthorization: Boolean(req.headers.get("authorization")),
      userAgent: req.headers.get("user-agent")
    });
  }

  try {
    await ensureDbReady();
  } catch (error) {
    if (process.env.OAUTH_DEBUG === "true") {
      const message = error instanceof Error ? error.message : String(error);
      console.error("[oauth/token] db_connect_error", { message });
    }
    return oauthError(req, "server_error", "Database connection failed", 500);
  }

  let parsed: {
    grantType: string;
    code: string;
    clientId: string;
    clientSecret: string;
    redirectUri: string;
    codeVerifier: string;
  };
  try {
    parsed = await getTokenRequestBody(req);
  } catch (error) {
    if (process.env.OAUTH_DEBUG === "true") {
      const message = error instanceof Error ? error.message : String(error);
      console.error("[oauth/token] parse_error", { message });
    }
    return oauthError(req, "invalid_request", "Unable to parse token request");
  }

  const { grantType, code, clientId, redirectUri, codeVerifier } = parsed;

  if (process.env.OAUTH_DEBUG === "true") {
    console.info("[oauth/token] parsed", {
      grantType,
      hasCode: Boolean(code),
      hasClientId: Boolean(clientId),
      hasRedirectUri: Boolean(redirectUri),
      verifierLength: codeVerifier.length
    });
  }

  if (grantType !== "authorization_code") {
    return oauthError(req, "unsupported_grant_type", "Only authorization_code is supported");
  }

  if (!code || !codeVerifier) {
    return oauthError(req, "invalid_request", "Missing required OAuth token fields");
  }

  if (!isValidPkceVerifier(codeVerifier)) {
    return oauthError(req, "invalid_request", "Invalid code_verifier");
  }

  if (clientId) {
    try {
      assertAllowedClientId(clientId);
    } catch {
      return oauthError(req, "unauthorized_client", "Client is not allowed");
    }
  }

  try {
    const token = await exchangeAuthorizationCode({
      code,
      clientId: clientId || undefined,
      redirectUri: redirectUri || undefined,
      codeVerifier
    });

    if (process.env.OAUTH_DEBUG === "true") {
      console.info("[oauth/token] success", {
        hasClientId: Boolean(clientId),
        hasRedirectUri: Boolean(redirectUri)
      });
    }

    return Response.json(
      {
        access_token: token.accessToken,
        token_type: "Bearer",
        expires_in: token.expiresIn,
        scope: token.scope
      },
      {
        headers: {
          "cache-control": "no-store",
          pragma: "no-cache",
          ...getCorsHeaders(req)
        }
      }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "invalid_grant";
    if (message === "invalid_grant") {
      if (process.env.OAUTH_DEBUG === "true") {
        console.warn("[oauth/token] invalid_grant", {
          hasClientId: Boolean(clientId),
          hasRedirectUri: Boolean(redirectUri),
          verifierLength: codeVerifier.length
        });
      }
      return oauthError(req, "invalid_grant", "Authorization code is invalid or expired");
    }
    if (process.env.OAUTH_DEBUG === "true") {
      console.error("[oauth/token] server_error", {
        grantType,
        hasClientId: Boolean(clientId),
        hasRedirectUri: Boolean(redirectUri),
        verifierLength: codeVerifier.length,
        message
      });
    }
    return oauthError(req, "server_error", "Token issuance failed", 500);
  }
}

function parseBasicAuthClientId(header: string | null) {
  const creds = parseBasicAuth(header);
  return creds?.clientId ?? null;
}

function parseBasicAuthClientSecret(header: string | null) {
  const creds = parseBasicAuth(header);
  return creds?.clientSecret ?? null;
}

function parseBasicAuth(header: string | null) {
  if (!header || !header.toLowerCase().startsWith("basic ")) {
    return null;
  }

  try {
    const raw = Buffer.from(header.slice(6).trim(), "base64").toString("utf8");
    const sep = raw.indexOf(":");
    if (sep < 0) {
      return { clientId: raw.trim(), clientSecret: "" };
    }
    return {
      clientId: raw.slice(0, sep).trim(),
      clientSecret: raw.slice(sep + 1)
    };
  } catch {
    return null;
  }
}

function getCorsHeaders(req: Request) {
  const origin = req.headers.get("origin") ?? "";
  const allowOrigin = isAllowedOrigin(origin) ? origin : "*";
  return {
    "access-control-allow-origin": allowOrigin,
    "access-control-allow-methods": "POST,OPTIONS",
    "access-control-allow-headers": "content-type,authorization",
    "access-control-max-age": "86400",
    vary: "Origin"
  };
}

function isAllowedOrigin(origin: string) {
  return (
    origin === "https://chatgpt.com" ||
    origin === "https://chat.openai.com" ||
    origin === "https://chatgpt.com/" ||
    origin === "https://chat.openai.com/"
  );
}
