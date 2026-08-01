import { AGENTS, getAgent, type Agent } from "./agents";

/**
 * Multi-agent orchestrator: a planner decomposes an objective into sub-tasks,
 * each assigned to one of the scoped agents; the workers run in turn (each with
 * its own MCP tool set); a synthesizer merges their outputs into one answer.
 *
 * The engine is provider-agnostic — it takes `generate` (planner/synthesizer)
 * and `runAgent` (worker) callbacks — so it is fully unit-testable without a
 * live model, and the API route wires in the real model + MCP tools.
 */

export type SubTask = { agentId: string; task: string };
export type SubResult = {
  agentId: string;
  agentName: string;
  task: string;
  output: string;
  error?: string;
};
export type Orchestration = {
  objective: string;
  plan: SubTask[];
  results: SubResult[];
  answer: string;
};

export type OrchestratorDeps = {
  generate: (prompt: string, system?: string) => Promise<string>;
  runAgent: (agent: Agent, task: string) => Promise<string>;
};

export const MAX_SUBTASKS = 5;

const VALID_IDS = new Set(AGENTS.map((a) => a.id));

/** Agents a plan may delegate to (everything except the catch-all "general"). */
export function delegatableAgents(): Agent[] {
  return AGENTS.filter((a) => a.id !== "general");
}

const PLANNER_SYSTEM =
  "You are a planning coordinator. You decompose an objective into a short " +
  "sequence of sub-tasks and assign each to the single most appropriate " +
  "specialist agent. Respond with JSON only.";

export function buildPlannerPrompt(objective: string): string {
  const roster = delegatableAgents()
    .map((a) => `- ${a.id}: ${a.description}`)
    .join("\n");
  return [
    `Objective: ${objective}`,
    "",
    "Available specialist agents:",
    roster,
    "",
    `Decompose the objective into 1–${MAX_SUBTASKS} sub-tasks. Assign each to `,
    "the best-fit agent by its id. Order them so earlier results inform later ",
    "ones. Respond with ONLY a JSON array, e.g.:",
    '[{"agentId":"research","task":"..."},{"agentId":"coder","task":"..."}]',
  ].join("\n");
}

/** Parse a planner response into validated sub-tasks (tolerant of fences/prose). */
export function parsePlan(raw: string): SubTask[] {
  const start = raw.indexOf("[");
  const end = raw.lastIndexOf("]");
  if (start === -1 || end === -1 || end <= start) return [];
  let arr: unknown;
  try {
    arr = JSON.parse(raw.slice(start, end + 1));
  } catch {
    return [];
  }
  if (!Array.isArray(arr)) return [];
  const out: SubTask[] = [];
  for (const item of arr) {
    if (!item || typeof item !== "object") continue;
    const agentId = String(
      (item as { agentId?: unknown }).agentId ?? ""
    ).trim();
    const task = String((item as { task?: unknown }).task ?? "").trim();
    if (!task || !VALID_IDS.has(agentId)) continue;
    out.push({ agentId, task });
    if (out.length >= MAX_SUBTASKS) break;
  }
  return out;
}

export async function planTasks(
  objective: string,
  deps: OrchestratorDeps
): Promise<SubTask[]> {
  const raw = await deps.generate(
    buildPlannerPrompt(objective),
    PLANNER_SYSTEM
  );
  const plan = parsePlan(raw);
  // Fallback: if planning fails, hand the whole objective to the General agent.
  return plan.length > 0 ? plan : [{ agentId: "general", task: objective }];
}

const SYNTH_SYSTEM =
  "You are a synthesis coordinator. You merge specialist agents' results into " +
  "one coherent answer for the user, noting which agent contributed what.";

export function buildSynthesisPrompt(
  objective: string,
  results: SubResult[]
): string {
  const blocks = results
    .map(
      (r, i) =>
        `### Step ${i + 1} — ${r.agentName} (${r.agentId})\nTask: ${r.task}\n${
          r.error ? `Error: ${r.error}` : r.output
        }`
    )
    .join("\n\n");
  return [
    `Objective: ${objective}`,
    "",
    "Specialist results:",
    blocks,
    "",
    "Write a single, well-structured answer that fulfils the objective using ",
    "these results. Attribute key contributions to the agent that produced ",
    "them, and note any gaps or disagreements.",
  ].join("\n");
}

export async function orchestrate(
  objective: string,
  deps: OrchestratorDeps
): Promise<Orchestration> {
  const plan = await planTasks(objective, deps);
  const results: SubResult[] = [];
  for (const step of plan) {
    const agent = getAgent(step.agentId);
    try {
      const output = await deps.runAgent(agent, step.task);
      results.push({
        agentId: agent.id,
        agentName: agent.name,
        task: step.task,
        output,
      });
    } catch (e) {
      results.push({
        agentId: agent.id,
        agentName: agent.name,
        task: step.task,
        output: "",
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }
  const answer = await deps.generate(
    buildSynthesisPrompt(objective, results),
    SYNTH_SYSTEM
  );
  return { objective, plan, results, answer };
}
