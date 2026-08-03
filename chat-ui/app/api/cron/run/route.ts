/**
 * Scheduled orchestration endpoint, called by the Container Apps cron job.
 * Runs a preset objective (SCHEDULED_OBJECTIVE) through the multi-agent
 * orchestrator. Authorized by a shared bearer secret (CRON_SECRET). Returns 404
 * when the scheduler isn't configured, so it's inert by default.
 */
export const runtime = "nodejs";
export const maxDuration = 120;

import { generateText } from "ai";
import { getModel } from "@/lib/model";
import { getMcpTools } from "@/lib/mcp";
import { orchestrate, type OrchestratorDeps } from "@/lib/orchestrator";
import { deliverWebhook, formatRunMessage } from "@/lib/webhook";

export async function POST(req: Request): Promise<Response> {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return Response.json(
      { error: "Scheduler not configured." },
      { status: 404 }
    );
  }
  if (req.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 });
  }
  const objective = process.env.SCHEDULED_OBJECTIVE?.trim();
  if (!objective) {
    return Response.json(
      { error: "No SCHEDULED_OBJECTIVE set." },
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
        const { text } = await generateText({
          model,
          system: agent.systemPrompt,
          prompt: context ? `${context}${task}` : task,
          tools,
          maxSteps: 5,
          maxTokens: 900,
        });
        return text;
      } finally {
        await close();
      }
    },
  };

  try {
    const result = await orchestrate(objective, deps);
    console.info(
      `[scheduled-run] objective=${objective} steps=${result.results.length}`
    );
    // Deliver to an incoming webhook (Slack/Teams) when configured.
    let delivered = false;
    const hook = process.env.SCHEDULED_WEBHOOK_URL;
    if (hook) {
      delivered = await deliverWebhook(
        hook,
        formatRunMessage(objective, result.answer, result.results.length)
      );
    }
    return Response.json({
      objective,
      steps: result.results.length,
      answer: result.answer,
      delivered,
    });
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}
