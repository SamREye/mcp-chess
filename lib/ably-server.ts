import * as Ably from "ably";

let restClient: Ably.Rest | null = null;

function getRestClient() {
  if (restClient) return restClient;

  const apiKey = process.env.ABLY_API_KEY;
  if (!apiKey) return null;

  restClient = new Ably.Rest({ key: apiKey });
  return restClient;
}

export async function createAblyTokenRequest(clientId: string) {
  const rest = getRestClient();
  if (!rest) {
    throw new Error("ABLY_API_KEY is not configured");
  }

  return rest.auth.createTokenRequest({
    clientId,
    capability: JSON.stringify({
      "game:*": ["subscribe"],
      games: ["subscribe"]
    }),
    ttl: 60 * 60 * 1000
  });
}

export async function publishGameEvent(
  gameId: string,
  eventName: string,
  data: Record<string, unknown>
) {
  const rest = getRestClient();
  if (!rest) {
    return { sent: false, skippedReason: "ABLY_API_KEY is not configured" };
  }

  try {
    await rest.channels.get(`game:${gameId}`).publish(eventName, {
      ...data,
      gameId,
      emittedAt: new Date().toISOString()
    });
    return { sent: true };
  } catch (error) {
    console.error("Failed to publish Ably game event", error);
    return {
      sent: false,
      error: error instanceof Error ? error.message : "Ably publish failed"
    };
  }
}

export async function publishGamesEvent(
  eventName: string,
  data: Record<string, unknown>
) {
  const rest = getRestClient();
  if (!rest) {
    return { sent: false, skippedReason: "ABLY_API_KEY is not configured" };
  }

  try {
    await rest.channels.get("games").publish(eventName, {
      ...data,
      emittedAt: new Date().toISOString()
    });
    return { sent: true };
  } catch (error) {
    console.error("Failed to publish Ably games event", error);
    return {
      sent: false,
      error: error instanceof Error ? error.message : "Ably publish failed"
    };
  }
}
