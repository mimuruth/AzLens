import { getMcpTools } from "@/lib/mcp";
import { serverForTool } from "@/lib/tools";
import type { ServerKey } from "@/lib/agents";

// Executes a single MCP tool after the user approves it in the UI. Uses the
// Node.js runtime because the MCP client relies on Node APIs.
export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request) {
  const { tool, args } = await req.json();

  if (!tool || typeof tool !== "string") {
    return Response.json({ error: "Missing tool name" }, { status: 400 });
  }

  // Scope the connection to the server that owns the tool when known.
  const server = serverForTool(tool) as ServerKey | undefined;
  const { tools, close } = await getMcpTools(server ? [server] : undefined);

  try {
    const entry = tools[tool] as
      | { execute?: (args: unknown, opts: unknown) => Promise<unknown> }
      | undefined;
    if (!entry || typeof entry.execute !== "function") {
      return Response.json(
        { error: `Unknown or non-executable tool: ${tool}` },
        { status: 400 }
      );
    }

    const result = await entry.execute(args ?? {}, {
      toolCallId: "approval",
      messages: [],
    });
    return Response.json({ result });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  } finally {
    await close();
  }
}
