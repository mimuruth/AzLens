/**
 * Orchestrator plan preview (human-in-the-loop). Returns the planner's proposed
 * sub-tasks without running any workers, so the UI can show them for approval /
 * editing before execution. Moderated like the full run.
 */
export const runtime = "nodejs";
export const maxDuration = 60;

import { generateText } from "ai";
import { getModel } from "@/lib/model";
import {
  planTasks,
  delegatableAgents,
  type OrchestratorDeps,
} from "@/lib/orchestrator";
import { moderateText } from "@/lib/safety";

export async function POST(req: Request): Promise<Response> {
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
        maxTokens: 700,
      });
      return text;
    },
    // Planning never runs workers.
    runAgent: async () => "",
  };

  try {
    const plan = await planTasks(objective.trim(), deps);
    return Response.json({
      plan,
      agents: delegatableAgents().map((a) => ({ id: a.id, name: a.name })),
    });
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}
