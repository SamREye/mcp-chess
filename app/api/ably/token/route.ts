import { auth } from "@/lib/auth";
import { createAblyTokenRequest } from "@/lib/ably-server";

export const dynamic = "force-dynamic";

function createClientId(userId: string | null) {
  if (userId) {
    return `user:${userId}`;
  }
  return `anon:${crypto.randomUUID()}`;
}

export async function GET() {
  try {
    const session = await auth();
    const tokenRequest = await createAblyTokenRequest(
      createClientId(session?.user?.id ?? null)
    );
    return Response.json(tokenRequest);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to create Ably token";
    return Response.json({ error: message }, { status: 503 });
  }
}
