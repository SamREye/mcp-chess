import { ensureDbReady } from "@/lib/db";
import {
  assertAllowedClientId,
  exchangeAuthorizationCode,
  isValidPkceVerifier
} from "@/lib/mcp-oauth";

export const dynamic = "force-dynamic";

function oauthError(error: string, description: string, status = 400) {
  return Response.json(
    {
      error,
      error_description: description
    },
    {
      status,
      headers: {
        "cache-control": "no-store",
        pragma: "no-cache"
      }
    }
  );
}

async function getTokenRequestBody(req: Request) {
  const contentType = req.headers.get("content-type") ?? "";

  if (contentType.includes("application/json")) {
    const json = (await req.json()) as Record<string, unknown>;
    return {
      grantType: String(json.grant_type ?? ""),
      code: String(json.code ?? ""),
      clientId: String(json.client_id ?? ""),
      redirectUri: String(json.redirect_uri ?? ""),
      codeVerifier: String(json.code_verifier ?? "")
    };
  }

  const form = await req.formData();
  return {
    grantType: String(form.get("grant_type") ?? ""),
    code: String(form.get("code") ?? ""),
    clientId: String(form.get("client_id") ?? ""),
    redirectUri: String(form.get("redirect_uri") ?? ""),
    codeVerifier: String(form.get("code_verifier") ?? "")
  };
}

export async function POST(req: Request) {
  await ensureDbReady();

  const { grantType, code, clientId, redirectUri, codeVerifier } =
    await getTokenRequestBody(req);

  if (grantType !== "authorization_code") {
    return oauthError("unsupported_grant_type", "Only authorization_code is supported");
  }

  if (!code || !clientId || !redirectUri || !codeVerifier) {
    return oauthError("invalid_request", "Missing required OAuth token fields");
  }

  if (!isValidPkceVerifier(codeVerifier)) {
    return oauthError("invalid_request", "Invalid code_verifier");
  }

  try {
    assertAllowedClientId(clientId);
  } catch {
    return oauthError("unauthorized_client", "Client is not allowed");
  }

  try {
    const token = await exchangeAuthorizationCode({
      code,
      clientId,
      redirectUri,
      codeVerifier
    });

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
          pragma: "no-cache"
        }
      }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "invalid_grant";
    if (message === "invalid_grant") {
      return oauthError("invalid_grant", "Authorization code is invalid or expired");
    }
    return oauthError("server_error", "Token issuance failed", 500);
  }
}
