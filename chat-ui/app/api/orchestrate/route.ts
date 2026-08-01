import { generateText } from "ai";
import { getModel } from "@/lib/model";
import { getMcpTools } from "@/lib/mcp";
import { estimateCost } from "@/lib/pricing";
import { orchestrate, type OrchestratorDeps } from "@/lib/orchestrator";
import { rateLimit, callerKey } from "@/lib/rate-limit";
import { moderateText } from "@/lib/safety";

// Multi-agent orchestration: plan → delegate to scoped agents → synthesize.
// Uses the MCP client (Node APIs) and may make several model calls, so give it
// the Node runtime and a longer budget.
export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(req: Request) {
  const limit = Number(process.env.RATE_LIMIT_PER_MIN ?? 0);
  if (limit > 0) {
    const gate = await rateLimit(callerKey(new Headers(req.headers)), limit);
    if (!gate.ok) {
      return new Response("Rate limit exceeded. Please wait and try again.", {
        status: 429,
        headers: { "Retry-After": String(gate.retryAfter) },
      });
    }
  }

  const { objective } = await req.json().catch(() => ({}));
  if (typeof objective !== "string" || objective.trim().length === 0) {
    return Response.json({ error: "Missing objective." }, { status: 400 });
  }

  const moderation = await moderateText(objective);
  if (!moderation.allowed) {
    return Response.json(
      {
        error: `Objective blocked by the safety filter (${moderation.categories.join(", ")}).`,
      },
      { status: 400 }
    );
  }

  const model = getModel();
  const deps: OrchestratorDeps = {
    generate: async (prompt, system) => {
      const { text } = await generateText({
        model,
        system,
        prompt,
        temperature: 0.2,
        maxTokens: 900,
      });
      return text;
    },
    runAgent: async (agent, task, context) => {
      const { tools, close } = await getMcpTools(agent.servers);
      try {
        const { text, usage } = await generateText({
          model,
          system: agent.systemPrompt,
          prompt: context ? `${context}${task}` : task,
          tools,
          maxSteps: 5,
          maxTokens: 900,
        });
        const modelId = (model as { modelId?: string }).modelId;
        return { output: text, usage, cost: estimateCost(modelId, usage) };
      } finally {
        await close();
      }
    },
  };

  // Stream progress as newline-delimited JSON (plan → step-start/done → answer).
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const enc = new TextEncoder();
      const emit = (e: unknown) =>
        controller.enqueue(enc.encode(JSON.stringify(e) + "\n"));
      deps.onEvent = emit;
      try {
        await orchestrate(objective.trim(), deps);
      } catch (e) {
        emit({
          type: "error",
          error: e instanceof Error ? e.message : String(e),
        });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "application/x-ndjson; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}
