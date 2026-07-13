import {
  streamText,
  convertToCoreMessages,
  createDataStreamResponse,
  type CoreMessage,
} from "ai";
import { getMcpTools } from "@/lib/mcp";
import { getModel } from "@/lib/model";
import { getAgent } from "@/lib/agents";
import { resolveAutoModel, lastUserText } from "@/lib/router";

// The MCP client uses Node APIs, so this route must run on the Node.js runtime.
export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request) {
  const { messages, provider, model, agentId } = await req.json();

  const agent = getAgent(agentId);
  const coreMessages = convertToCoreMessages(messages);

  // Decide the model. An explicit picker choice wins; "auto" (or no choice)
  // routes by task complexity across whatever providers are configured.
  let chosen: { provider?: string; model?: string } = { provider, model };
  let routed: { tier: string; reason: string } | null = null;
  if (!provider || provider === "auto" || model === "auto") {
    const decision = resolveAutoModel(
      lastUserText(coreMessages as CoreMessage[])
    );
    chosen = { provider: decision.provider, model: decision.model };
    routed = { tier: decision.tier, reason: decision.reason };
  }

  const { tools, close } = await getMcpTools(agent.servers);

  return createDataStreamResponse({
    execute: (dataStream) => {
      // Tell the UI which agent/model handled this turn (shown as a badge).
      dataStream.writeMessageAnnotation({
        agent: agent.id,
        agentName: agent.name,
        provider: chosen.provider ?? "",
        model: chosen.model ?? "",
        ...(routed
          ? { routed: true, tier: routed.tier, reason: routed.reason }
          : {}),
      });

      const result = streamText({
        model: getModel(chosen),
        system: agent.systemPrompt,
        messages: coreMessages,
        tools,
        // Allow the model to call tools and then continue reasoning.
        maxSteps: 5,
        // Close the MCP connections once the full response has been produced.
        onFinish: async () => {
          await close();
        },
      });

      result.mergeIntoDataStream(dataStream);
    },
    // Surface the real error text to the browser to make debugging easier.
    onError: (error) =>
      error instanceof Error ? error.message : String(error),
  });
}
