import { getPromptText, readResourceText } from "@/lib/mcp-extra";
import type { ServerKey } from "@/lib/agents";

// Resolves a prompt template or reads a resource, returning text for the composer.
export const runtime = "nodejs";

export async function POST(req: Request): Promise<Response> {
  try {
    const body = await req.json();
    const server = body.server as ServerKey;
    if (body.kind === "prompt") {
      const text = await getPromptText(
        server,
        String(body.name),
        (body.args ?? {}) as Record<string, string>
      );
      return Response.json({ text });
    }
    if (body.kind === "resource") {
      const text = await readResourceText(server, String(body.uri));
      return Response.json({ text });
    }
    return Response.json({ error: "Unknown kind" }, { status: 400 });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
