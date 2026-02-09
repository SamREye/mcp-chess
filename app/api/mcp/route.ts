import { auth } from "@/lib/auth";
import { ensureDbReady } from "@/lib/db";
import { executeTool, toolDefs } from "@/lib/mcp-tools";

type JsonRpcRequest = {
  jsonrpc?: string;
  id?: string | number | null;
  method?: string;
  params?: any;
};

function jsonRpcSuccess(id: string | number | null | undefined, result: unknown) {
  return Response.json({
    jsonrpc: "2.0",
    id: id ?? null,
    result
  });
}

function jsonRpcError(
  id: string | number | null | undefined,
  code: number,
  message: string
) {
  return Response.json(
    {
      jsonrpc: "2.0",
      id: id ?? null,
      error: { code, message }
    },
    { status: 400 }
  );
}

export async function GET() {
  return Response.json({
    name: "mcp-chess",
    protocol: "JSON-RPC 2.0",
    endpoint: "/api/mcp"
  });
}

export async function POST(req: Request) {
  let body: JsonRpcRequest;
  try {
    body = (await req.json()) as JsonRpcRequest;
  } catch {
    return jsonRpcError(null, -32700, "Invalid JSON");
  }

  const { id, method, params } = body;

  try {
    await ensureDbReady();

    if (method === "initialize") {
      return jsonRpcSuccess(id, {
        protocolVersion: "2024-11-05",
        serverInfo: { name: "mcp-chess", version: "0.1.0" },
        capabilities: {
          tools: {}
        }
      });
    }

    if (method === "tools/list") {
      return jsonRpcSuccess(id, {
        tools: toolDefs.map((tool) => ({
          name: tool.name,
          description: tool.description,
          inputSchema: tool.inputSchema
        }))
      });
    }

    if (method === "tools/call") {
      const session = await auth();
      const name = params?.name;
      const args = params?.arguments ?? {};

      if (typeof name !== "string" || !name) {
        return jsonRpcError(id, -32602, "Invalid params: tool name is required");
      }

      const result = await executeTool(name, args, {
        userId: session?.user?.id ?? null
      });

      return jsonRpcSuccess(id, {
        content: [{ type: "text", text: JSON.stringify(result) }],
        structuredContent: result
      });
    }

    return jsonRpcError(id, -32601, `Method not found: ${method ?? "<missing>"}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal error";
    return jsonRpcError(id, -32000, message);
  }
}
