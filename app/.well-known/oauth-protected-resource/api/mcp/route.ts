import { getBaseUrl, getProtectedResourceMetadata } from "@/lib/mcp-oauth";

export async function GET(req: Request) {
  const baseUrl = getBaseUrl(req);
  return Response.json(getProtectedResourceMetadata(baseUrl));
}
