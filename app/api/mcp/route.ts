import { auth } from "@/lib/auth";
import { ensureDbReady } from "@/lib/db";
import {
  getBaseUrl,
  getUserIdFromBearerToken,
  getWwwAuthenticateHeader
} from "@/lib/mcp-oauth";
import { executeTool, toolDefs } from "@/lib/mcp-tools";

export const dynamic = "force-dynamic";

const readOnlyToolNames = new Set([
  "query_users_by_email",
  "snapshot",
  "status",
  "get_game_status",
  "history",
  "get_game_history",
  "list_games",
  "get_game",
  "get_chat_messages"
]);

type JsonRpcRequest = {
  jsonrpc?: string;
  id?: string | number | null;
  method?: string;
  params?: any;
};

type ToolContentItem =
  | {
      type: "text";
      text: string;
    }
  | {
      type: "image";
      data: string;
      mimeType: string;
    };

function buildToolContent(name: string, result: unknown): ToolContentItem[] {
  if (name === "snapshot" && result && typeof result === "object") {
    const rawData =
      "data" in result && typeof result.data === "string" ? result.data.trim() : null;
    const rawMimeType =
      "mimeType" in result && typeof result.mimeType === "string" ? result.mimeType : null;

    if (rawData && rawMimeType?.startsWith("image/")) {
      return [
        {
          type: "image",
          data: rawData,
          mimeType: rawMimeType
        }
      ];
    }

    const rawDataUrl =
      "dataUrl" in result && typeof result.dataUrl === "string" ? result.dataUrl : null;

    const parsed = parseImageDataUrl(rawDataUrl);
    if (parsed) {
      return [
        {
          type: "image",
          data: parsed.base64,
          mimeType: rawMimeType ?? parsed.mimeType
        }
      ];
    }
  }

  return [{ type: "text", text: JSON.stringify(result) }];
}

function parseImageDataUrl(dataUrl: string | null) {
  if (!dataUrl) return null;
  const match = dataUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,([A-Za-z0-9+/=_-]+)$/);
  if (!match) return null;
  return { mimeType: match[1], base64: match[2] };
}

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
  message: string,
  options?: { status?: number; headers?: HeadersInit }
) {
  return Response.json(
    {
      jsonrpc: "2.0",
      id: id ?? null,
      error: { code, message }
    },
    {
      status: options?.status ?? 400,
      headers: options?.headers
    }
  );
}

export async function GET(req: Request) {
  const baseUrl = getBaseUrl(req);
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

    if (method === "notifications/initialized") {
      return new Response(null, { status: 204 });
    }

    if (method === "ping") {
      return jsonRpcSuccess(id, {});
    }

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
          inputSchema: tool.inputSchema,
          ...(readOnlyToolNames.has(tool.name)
            ? {
                annotations: {
                  readOnlyHint: true
                }
              }
            : {})
        }))
      });
    }

    if (method === "resources/list") {
      return jsonRpcSuccess(id, {
        resources: []
      });
    }

    if (method === "resources/templates/list") {
      return jsonRpcSuccess(id, {
        resourceTemplates: []
      });
    }

    if (method === "prompts/list") {
      return jsonRpcSuccess(id, {
        prompts: []
      });
    }

    if (method === "tools/call") {
      const session = await auth();
      const bearerUserId = await getUserIdFromBearerToken(req.headers.get("authorization"));
      const name = params?.name;
      const args = params?.arguments ?? {};

      if (typeof name !== "string" || !name) {
        return jsonRpcError(id, -32602, "Invalid params: tool name is required");
      }

      let result: unknown;
      try {
        result = await executeTool(name, args, {
          userId: session?.user?.id ?? bearerUserId
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Internal error";
        if (message === "Authentication required") {
          const baseUrl = getBaseUrl(req);
          return jsonRpcError(id, -32001, message, {
            status: 401,
            headers: {
              "www-authenticate": getWwwAuthenticateHeader(baseUrl)
            }
          });
        }
        throw error;
      }

      return jsonRpcSuccess(id, {
        content: buildToolContent(name, result),
        structuredContent: result
      });
    }

    return jsonRpcError(id, -32601, `Method not found: ${method ?? "<missing>"}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal error";
    return jsonRpcError(id, -32000, message);
  }
}
