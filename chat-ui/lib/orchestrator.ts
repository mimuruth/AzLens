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

export type SubTask = { agentId: string; task: string; dependsOn?: number[] };
export type TokenUsage = {
  promptTokens?: number | null;
  completionTokens?: number | null;
  totalTokens?: number | null;
};
export type SubResult = {
  agentId: string;
  agentName: string;
  task: string;
  output: string;
  error?: string;
  usage?: TokenUsage;
  cost?: number | null;
  /** Milliseconds from orchestration start (for the parallelism timeline). */
  startedAt?: number;
  endedAt?: number;
};
export type Orchestration = {
  objective: string;
  plan: SubTask[];
  results: SubResult[];
  answer: string;
};

/** A worker may return plain text or text plus token usage/cost. */
export type WorkerOutput =
  string | { output: string; usage?: TokenUsage; cost?: number | null };

/** Streamed progress events (emitted in order the work happens). */
export type OrchestratorEvent =
  | { type: "plan"; plan: SubTask[] }
  | {
      type: "step-start";
      index: number;
      agentId: string;
      agentName: string;
      task: string;
      at: number;
    }
  | { type: "step-done"; index: number; result: SubResult }
  | { type: "answer"; answer: string }
  | { type: "error"; error: string };

export type OrchestratorDeps = {
  generate: (prompt: string, system?: string) => Promise<string>;
  /** Run a worker; `context` carries the outputs of its dependency steps. */
  runAgent: (
    agent: Agent,
    task: string,
    context?: string
  ) => Promise<WorkerOutput>;
  /** Optional progress sink for streaming UIs. */
  onEvent?: (event: OrchestratorEvent) => void;
};

export const MAX_SUBTASKS = 5;
/** Cap on workers running at once (independent sub-tasks fan out in parallel). */
export const MAX_CONCURRENCY = 3;

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
    "the best-fit agent by its id. Independent sub-tasks run in parallel; if a ",
    'sub-task needs an earlier one\'s output, list those positions in "dependsOn" ',
    "(0-based indices into this array). Respond with ONLY a JSON array, e.g.:",
    '[{"agentId":"research","task":"..."},{"agentId":"coder","task":"...","dependsOn":[0]}]',
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
    const rawDeps = (item as { dependsOn?: unknown }).dependsOn;
    const dependsOn = Array.isArray(rawDeps)
      ? rawDeps
          .map((n) => Math.trunc(Number(n)))
          .filter((n) => Number.isFinite(n))
      : undefined;
    out.push(
      dependsOn && dependsOn.length
        ? { agentId, task, dependsOn }
        : { agentId, task }
    );
    if (out.length >= MAX_SUBTASKS) break;
  }
  // Keep only dependency indices that point at valid earlier-or-other tasks.
  return out.map((t) => {
    if (!t.dependsOn) return t;
    const deps = [...new Set(t.dependsOn)].filter(
      (i) => i >= 0 && i < out.length && i !== out.indexOf(t)
    );
    return deps.length
      ? { ...t, dependsOn: deps }
      : { agentId: t.agentId, task: t.task };
  });
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

/** Validate a caller-supplied (e.g. user-edited) plan the same way parsePlan does. */
export function sanitizePlan(
  tasks: { agentId?: string; task?: string; dependsOn?: number[] }[]
): SubTask[] {
  const out: SubTask[] = [];
  for (const t of tasks ?? []) {
    const agentId = String(t?.agentId ?? "").trim();
    const task = String(t?.task ?? "").trim();
    if (!task || !VALID_IDS.has(agentId)) continue;
    const dependsOn = Array.isArray(t.dependsOn)
      ? t.dependsOn
          .map((n) => Math.trunc(Number(n)))
          .filter((n) => Number.isFinite(n))
      : undefined;
    out.push(
      dependsOn && dependsOn.length
        ? { agentId, task, dependsOn }
        : { agentId, task }
    );
    if (out.length >= MAX_SUBTASKS) break;
  }
  return out.map((t) => {
    if (!t.dependsOn) return t;
    const deps = [...new Set(t.dependsOn)].filter(
      (i) => i >= 0 && i < out.length && i !== out.indexOf(t)
    );
    return deps.length
      ? { ...t, dependsOn: deps }
      : { agentId: t.agentId, task: t.task };
  });
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

/** Concatenate dependency outputs into a context block for a dependent worker. */
function contextFrom(
  deps: number[] | undefined,
  results: (SubResult | undefined)[]
): string {
  if (!deps?.length) return "";
  const blocks = deps
    .map((i) => results[i])
    .filter((r): r is SubResult => Boolean(r) && !r!.error)
    .map((r) => `From ${r.agentName} — ${r.task}:\n${r.output}`);
  return blocks.length
    ? `Context from earlier steps:\n\n${blocks.join("\n\n")}\n\n`
    : "";
}

/**
 * Run the plan respecting `dependsOn`: any sub-task whose dependencies are all
 * done becomes runnable, and runnable tasks execute in parallel up to
 * MAX_CONCURRENCY. Results are returned in plan order.
 */
export async function runPlan(
  plan: SubTask[],
  deps: OrchestratorDeps,
  maxConcurrency = MAX_CONCURRENCY
): Promise<SubResult[]> {
  const results: (SubResult | undefined)[] = new Array(plan.length);
  const started = new Array(plan.length).fill(false);
  let done = 0;
  let inFlight = 0;
  const t0 = Date.now();

  const ready = (i: number) =>
    !started[i] &&
    (plan[i].dependsOn ?? []).every((d) => results[d] !== undefined);

  return new Promise<SubResult[]>((resolve, reject) => {
    const pump = () => {
      if (done === plan.length) {
        resolve(results.map((r) => r as SubResult));
        return;
      }
      for (let i = 0; i < plan.length && inFlight < maxConcurrency; i++) {
        if (!ready(i)) continue;
        // Break a dependency deadlock (e.g. a cycle) by ignoring unmet deps.
        started[i] = true;
        inFlight++;
        const step = plan[i];
        const agent = getAgent(step.agentId);
        const startedAt = Date.now() - t0;
        deps.onEvent?.({
          type: "step-start",
          index: i,
          agentId: agent.id,
          agentName: agent.name,
          task: step.task,
          at: startedAt,
        });
        const ctx = contextFrom(step.dependsOn, results);
        Promise.resolve(deps.runAgent(agent, step.task, ctx || undefined))
          .then((raw) =>
            typeof raw === "string"
              ? { output: raw }
              : { output: raw.output, usage: raw.usage, cost: raw.cost }
          )
          .catch((e) => ({
            output: "",
            error: e instanceof Error ? e.message : String(e),
          }))
          .then((r) => {
            const result: SubResult = {
              agentId: agent.id,
              agentName: agent.name,
              task: step.task,
              output: (r as { output: string }).output,
              error: (r as { error?: string }).error,
              usage: (r as { usage?: TokenUsage }).usage,
              cost: (r as { cost?: number | null }).cost,
              startedAt,
              endedAt: Date.now() - t0,
            };
            results[i] = result;
            inFlight--;
            done++;
            deps.onEvent?.({ type: "step-done", index: i, result });
            pump();
          });
      }
      // Deadlock guard: nothing running and nothing ready but work remains.
      if (inFlight === 0 && done < plan.length) {
        const next = started.findIndex((s) => !s);
        if (next !== -1) {
          plan[next] = { agentId: plan[next].agentId, task: plan[next].task };
          pump();
        } else {
          reject(
            new Error("Orchestrator stalled with unresolved dependencies.")
          );
        }
      }
    };
    pump();
  });
}

export async function orchestrate(
  objective: string,
  deps: OrchestratorDeps,
  presetPlan?: SubTask[]
): Promise<Orchestration> {
  const plan =
    presetPlan && presetPlan.length > 0
      ? presetPlan
      : await planTasks(objective, deps);
  deps.onEvent?.({ type: "plan", plan });

  const results = await runPlan(plan, deps);

  const answer = await deps.generate(
    buildSynthesisPrompt(objective, results),
    SYNTH_SYSTEM
  );
  deps.onEvent?.({ type: "answer", answer });
  return { objective, plan, results, answer };
}
