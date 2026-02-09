import { auth } from "@/lib/auth";
import { ensureDbReady } from "@/lib/db";
import {
  assertAllowedClientId,
  createAuthorizationCode,
  getBaseUrl,
  getMcpScope,
  isValidCodeChallenge,
  validateRedirectUri
} from "@/lib/mcp-oauth";

export const dynamic = "force-dynamic";

function redirectWithError(
  redirectUri: string,
  state: string | null,
  error: string,
  description: string
) {
  const target = new URL(redirectUri);
  target.searchParams.set("error", error);
  target.searchParams.set("error_description", description);
  if (state) {
    target.searchParams.set("state", state);
  }
  return Response.redirect(target, 302);
}

export async function GET(req: Request) {
  await ensureDbReady();

  const baseUrl = getBaseUrl(req);
  const url = new URL(req.url);
  const responseType = url.searchParams.get("response_type");
  const clientId = url.searchParams.get("client_id");
  const redirectUri = url.searchParams.get("redirect_uri");
  const state = url.searchParams.get("state");
  const scope = (url.searchParams.get("scope") ?? getMcpScope()).trim();
  const resource = url.searchParams.get("resource");
  const codeChallenge = url.searchParams.get("code_challenge");
  const codeChallengeMethod = (
    url.searchParams.get("code_challenge_method") ?? "plain"
  ).trim();

  if (!clientId || !redirectUri) {
    return Response.json(
      { error: "invalid_request", error_description: "Missing client_id or redirect_uri" },
      { status: 400 }
    );
  }

  if (!validateRedirectUri(redirectUri)) {
    return Response.json(
      { error: "invalid_request", error_description: "Invalid redirect_uri" },
      { status: 400 }
    );
  }

  if (responseType !== "code") {
    return redirectWithError(
      redirectUri,
      state,
      "unsupported_response_type",
      "Only response_type=code is supported"
    );
  }

  if (!codeChallenge || !isValidCodeChallenge(codeChallenge)) {
    return redirectWithError(
      redirectUri,
      state,
      "invalid_request",
      "Missing or invalid code_challenge"
    );
  }

  if (codeChallengeMethod !== "S256" && codeChallengeMethod !== "plain") {
    return redirectWithError(
      redirectUri,
      state,
      "invalid_request",
      "Unsupported code_challenge_method"
    );
  }

  try {
    assertAllowedClientId(clientId);
  } catch {
    return redirectWithError(
      redirectUri,
      state,
      "unauthorized_client",
      "Client is not allowed"
    );
  }

  const session = await auth();
  if (!session?.user?.id) {
    const signIn = new URL("/api/auth/signin/google", baseUrl);
    const callbackUrl = new URL("/oauth/authorize", baseUrl);
    callbackUrl.search = url.search;
    signIn.searchParams.set("prompt", "select_account");
    signIn.searchParams.set("callbackUrl", callbackUrl.toString());
    return Response.redirect(signIn, 302);
  }

  const code = await createAuthorizationCode({
    userId: session.user.id,
    clientId,
    redirectUri,
    codeChallenge,
    codeChallengeMethod,
    scope: scope || getMcpScope(),
    resource: resource ?? undefined
  });

  const target = new URL(redirectUri);
  target.searchParams.set("code", code);
  if (state) {
    target.searchParams.set("state", state);
  }

  return Response.redirect(target, 302);
}
