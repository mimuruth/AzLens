import { streamText, convertToCoreMessages } from "ai";
import { getMcpTools } from "@/lib/mcp";
import { getModel } from "@/lib/model";

// The MCP client uses Node APIs, so this route must run on the Node.js runtime.
export const runtime = "nodejs";
export const maxDuration = 60;

const SYSTEM_PROMPT = [
  "You are a helpful assistant with access to tools exposed by three MCP servers:",
  "- mcp-local-coder: read/write files and search code.",
  "- AzLens-mcp: query Azure resources, run KQL log queries, and search the wiki.",
  "- mcp-personal-assistant: read daily notes and update a to-do list.",
  "Use the tools when they help answer the user. Explain what you did concisely.",
].join("\n");

export async function POST(req: Request) {
  const { messages } = await req.json();

  const { tools, close } = await getMcpTools();

  const result = streamText({
    model: getModel(),
    system: SYSTEM_PROMPT,
    messages: convertToCoreMessages(messages),
    tools,
    // Allow the model to call tools and then continue reasoning with the result.
    maxSteps: 5,
    // Close the MCP connections once the full response has been produced.
    onFinish: async () => {
      await close();
    },
  });

  // Surface the real error text to the browser to make local debugging easier.
  return result.toDataStreamResponse({
    getErrorMessage: (error) =>
      error instanceof Error ? error.message : String(error),
  });
}
