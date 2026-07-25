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
import { rateLimit, callerKey } from "@/lib/rate-limit";

// The MCP client uses Node APIs, so this route must run on the Node.js runtime.
export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request) {
  // Optional per-caller rate limit (requests/min). 0 (default) disables it.
  const limit = Number(process.env.RATE_LIMIT_PER_MIN ?? 0);
  if (limit > 0) {
    const gate = await rateLimit(callerKey(new Headers(req.headers)), limit);
    if (!gate.ok) {
      return new Response(
        "Rate limit exceeded. Please wait a moment and try again.",
        { status: 429, headers: { "Retry-After": String(gate.retryAfter) } }
      );
    }
  }

  const {
    messages,
    provider,
    model,
    agentId,
    requireApproval,
    instructions,
    mode,
  } = await req.json();

  const agent = getAgent(agentId);
  const coreMessages = convertToCoreMessages(messages);

  // A composer "mode" (Kimi-style) prepends a behaviour hint to the prompt.
  const MODE_HINTS: Record<string, string> = {
    swarm:
      "Mode: Swarm. Reason in multiple independent passes over the problem, then synthesise the strongest combined answer and note where the passes disagreed.",
    slide:
      "Mode: Slide. Produce a slide-deck outline — a sequence of titled slides, each with 3–5 concise bullet points, ending with a summary slide.",
    "deep-research":
      "Mode: Deep Research. Investigate thoroughly: decompose the question, use the available tools extensively to gather evidence, and cite the sources you relied on.",
    websites:
      "Mode: Websites. Focus on finding and summarising information as if browsing the web; include relevant links/URLs and clearly separate sources.",
    docs: "Mode: Docs. Produce a well-structured long-form document with a title, headings, and prose suitable for sharing.",
    sheets:
      "Mode: Sheets. Return structured, tabular output as Markdown tables (or CSV) suitable for pasting into a spreadsheet.",
  };
  const modeHint =
    typeof mode === "string" && MODE_HINTS[mode] ? MODE_HINTS[mode] : "";

  // Per-conversation instructions (if any) refine the agent's base prompt.
  const extras = [
    typeof instructions === "string" && instructions.trim().length > 0
      ? `Additional instructions for this conversation:\n${instructions.trim()}`
      : "",
    modeHint,
  ].filter(Boolean);
  const systemPrompt =
    extras.length > 0
      ? `${agent.systemPrompt}\n\n${extras.join("\n\n")}`
      : agent.systemPrompt;

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
        system: systemPrompt,
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
    // Surface the real error text to the browser. For a local (LM Studio /
    // Ollama) server that's unreachable, return a clear, actionable hint.
    onError: (error) => {
      const msg = error instanceof Error ? error.message : String(error);
      if (
        chosen.provider === "local" &&
        /connect|fetch failed|ECONNREFUSED|network|timed out|timeout/i.test(msg)
      ) {
        const base =
          process.env.LOCAL_OPENAI_BASE_URL || "http://localhost:1234/v1";
        return (
          `Can't reach the local model server at ${base}. ` +
          "In LM Studio, open the Developer (Local Server) tab, load a model, " +
          "and click Start Server — then try again. " +
          "(You can also pick a different model in the top-right picker.)"
        );
      }
      if (
        /model|does not exist|not found|unknown model|invalid model|404/i.test(
          msg
        )
      ) {
        return (
          `The model "${chosen.model}" isn't available on ${chosen.provider}. ` +
          "Pick a different model in the top-right picker (or choose Auto). " +
          `Original error: ${msg}`
        );
      }
      return msg;
    },
  });
}
