import { getLibrary } from "@/lib/mcp-extra";

// Lists MCP prompts and resources across servers. Node runtime for the MCP client.
export const runtime = "nodejs";

export async function GET(): Promise<Response> {
  try {
    return Response.json(await getLibrary());
  } catch {
    return Response.json({ prompts: [], resources: [] });
  }
}
