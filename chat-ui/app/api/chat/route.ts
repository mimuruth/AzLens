import {
  streamText,
  convertToCoreMessages,
  createDataStreamResponse,
  type CoreMessage,
} from "ai";
import { getMcpTools } from "@/lib/mcp";
import { getModel } from "@/lib/model";
import { getAgent } from "@/lib/agents";
import {
  resolveAutoModel,
  lastUserText,
  isProviderReachable,
} from "@/lib/router";
import { estimateCost } from "@/lib/pricing";
import { recordChatTurn } from "@/lib/telemetry-events";

// The MCP client uses Node APIs, so this route must run on the Node.js runtime.
export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request) {
  const { messages, provider, model, agentId, requireApproval } =
    await req.json();

  const agent = getAgent(agentId);
  const coreMessages = convertToCoreMessages(messages);

  // Decide the model. An explicit picker choice wins; "auto" (or no choice)
  // routes by task complexity across whatever providers are configured.
  let chosen: { provider?: string; model?: string } = { provider, model };
  let routed: { tier: string; reason: string } | null = null;
  if (!provider || provider === "auto" || model === "auto") {
    const text = lastUserText(coreMessages as CoreMessage[]);
    let decision = resolveAutoModel(text);
    // Routing resilience: if we picked a local server that is currently down,
    // fall back to the next available provider instead of failing the turn.
    if (
      decision.provider === "local" &&
      !(await isProviderReachable("local"))
    ) {
      try {
        const fallback = resolveAutoModel(text, ["local"]);
        decision = {
          ...fallback,
          reason: `${fallback.reason} · local offline`,
        };
      } catch {
        // No alternative provider — keep the local pick; it will error clearly.
      }
    }
    chosen = { provider: decision.provider, model: decision.model };
    routed = { tier: decision.tier, reason: decision.reason };
  }

  const { tools, close } = await getMcpTools(agent.servers, {
    requireApproval: requireApproval === true,
  });

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
        // On completion: report token usage + estimated cost to the UI, emit a
        // telemetry span, and close the MCP connections.
        // On completion: report token usage + estimated cost to the UI, emit a
        // telemetry span, and close the MCP connections. Some providers don't
        // report usage for streamed responses; those values stay null.
        onFinish: async ({ usage }) => {
          const finite = (n: unknown): number | null =>
            typeof n === "number" && Number.isFinite(n) ? n : null;
          const promptTokens = finite(usage?.promptTokens);
          const completionTokens = finite(usage?.completionTokens);
          const totalTokens =
            finite(usage?.totalTokens) ??
            (promptTokens != null || completionTokens != null
              ? (promptTokens ?? 0) + (completionTokens ?? 0)
              : null);
          const costUsd = estimateCost(chosen.model, usage);

          dataStream.writeMessageAnnotation({
            usage: { promptTokens, completionTokens, totalTokens },
            ...(costUsd != null ? { costUsd } : {}),
          });
          recordChatTurn({
            agent: agent.id,
            provider: chosen.provider ?? "",
            model: chosen.model ?? "",
            tier: routed?.tier ?? "explicit",
            promptTokens: promptTokens ?? 0,
            completionTokens: completionTokens ?? 0,
            ...(costUsd != null ? { costUsd } : {}),
          });
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
