export async function callMcpTool<T>(
  name: string,
  args: Record<string, unknown> = {}
): Promise<T> {
  const res = await fetch("/api/mcp", {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: crypto.randomUUID(),
      method: "tools/call",
      params: {
        name,
        arguments: args
      }
    }),
    credentials: "same-origin"
  });

  const payload = await res.json();

  if (payload.error) {
    throw new Error(payload.error.message ?? "MCP call failed");
  }

  const structured = payload?.result?.structuredContent;
  if (structured !== undefined) {
    return structured as T;
  }

  const text = payload?.result?.content?.[0]?.text;
  if (typeof text === "string") {
    return JSON.parse(text) as T;
  }

  throw new Error("Invalid MCP response");
}
