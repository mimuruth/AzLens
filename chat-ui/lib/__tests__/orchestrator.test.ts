import { describe, it, expect } from "vitest";
import {
  parsePlan,
  planTasks,
  orchestrate,
  runPlan,
  sanitizePlan,
  buildPlannerPrompt,
  MAX_SUBTASKS,
  type OrchestratorDeps,
  type OrchestratorEvent,
} from "../orchestrator";

const plannerJson = JSON.stringify([
  { agentId: "research", task: "Gather latency facts" },
  { agentId: "coder", task: "Write a retry helper" },
]);

// Deterministic deps: the planner call returns canned JSON; other generate
// calls (synthesis) return a marker; runAgent echoes the agent + task.
function deps(planRaw: string): OrchestratorDeps {
  return {
    generate: async (prompt) =>
      prompt.includes("Decompose the objective")
        ? planRaw
        : "FINAL: merged answer",
    runAgent: async (agent, task) => `[${agent.id}] ${task}`,
  };
}

describe("parsePlan", () => {
  it("parses a plain JSON array and validates agent ids", () => {
    expect(parsePlan(plannerJson)).toEqual([
      { agentId: "research", task: "Gather latency facts" },
      { agentId: "coder", task: "Write a retry helper" },
    ]);
  });

  it("tolerates code fences and surrounding prose", () => {
    const raw = "Here is the plan:\n```json\n" + plannerJson + "\n```\nDone.";
    expect(parsePlan(raw)).toHaveLength(2);
  });

  it("drops entries with unknown agent ids or empty tasks", () => {
    const raw = JSON.stringify([
      { agentId: "nope", task: "x" },
      { agentId: "coder", task: "" },
      { agentId: "cost", task: "Check spend" },
    ]);
    expect(parsePlan(raw)).toEqual([{ agentId: "cost", task: "Check spend" }]);
  });

  it("caps the plan at MAX_SUBTASKS", () => {
    const raw = JSON.stringify(
      Array.from({ length: 9 }, () => ({ agentId: "coder", task: "t" }))
    );
    expect(parsePlan(raw)).toHaveLength(MAX_SUBTASKS);
  });

  it("returns [] for non-JSON garbage", () => {
    expect(parsePlan("no json here")).toEqual([]);
    expect(parsePlan("")).toEqual([]);
  });
});

describe("planTasks", () => {
  it("falls back to the general agent when planning yields nothing", async () => {
    const plan = await planTasks("Do the thing", deps("garbage, no array"));
    expect(plan).toEqual([{ agentId: "general", task: "Do the thing" }]);
  });
});

describe("orchestrate", () => {
  it("plans, runs each sub-agent, and synthesizes an answer", async () => {
    const result = await orchestrate(
      "Compare regions and add retries",
      deps(plannerJson)
    );
    expect(result.plan).toHaveLength(2);
    expect(result.results.map((r) => r.agentId)).toEqual(["research", "coder"]);
    expect(result.results[0].output).toBe("[research] Gather latency facts");
    expect(result.answer).toBe("FINAL: merged answer");
  });

  it("captures a worker error without aborting the run", async () => {
    const d: OrchestratorDeps = {
      ...deps(plannerJson),
      runAgent: async (agent, task) => {
        if (agent.id === "research") throw new Error("tool down");
        return `[${agent.id}] ${task}`;
      },
    };
    const result = await orchestrate("obj", d);
    expect(result.results[0].error).toBe("tool down");
    expect(result.results[1].output).toContain("[coder]");
    expect(result.answer).toBe("FINAL: merged answer");
  });
});

describe("buildPlannerPrompt", () => {
  it("lists delegatable agents and excludes general", () => {
    const p = buildPlannerPrompt("obj");
    expect(p).toContain("research:");
    expect(p).toContain("coder:");
    expect(p).not.toMatch(/^- general:/m);
  });
});

describe("sanitizePlan", () => {
  it("drops invalid agent ids and empty tasks", () => {
    expect(
      sanitizePlan([
        { agentId: "coder", task: "build" },
        { agentId: "nope", task: "x" },
        { agentId: "cost", task: "" },
      ])
    ).toEqual([{ agentId: "coder", task: "build" }]);
  });

  it("keeps valid dependsOn and caps at MAX_SUBTASKS", () => {
    const many = Array.from({ length: 9 }, () => ({
      agentId: "coder",
      task: "t",
    }));
    expect(sanitizePlan(many)).toHaveLength(MAX_SUBTASKS);
    expect(
      sanitizePlan([
        { agentId: "research", task: "a" },
        { agentId: "coder", task: "b", dependsOn: [0] },
      ])[1].dependsOn
    ).toEqual([0]);
  });
});

describe("orchestrate with a preset plan", () => {
  it("skips planning and runs the supplied plan", async () => {
    let planned = false;
    const deps: OrchestratorDeps = {
      generate: async (prompt) => {
        if (prompt.includes("Decompose the objective")) planned = true;
        return "FINAL";
      },
      runAgent: async (agent) => `[${agent.id}]`,
    };
    const preset = [{ agentId: "cost", task: "check spend" }];
    const result = await orchestrate("obj", deps, preset);
    expect(planned).toBe(false); // planner was not invoked
    expect(result.results.map((r) => r.agentId)).toEqual(["cost"]);
  });
});

describe("parsePlan — dependencies", () => {
  it("keeps valid dependsOn indices", () => {
    const raw = JSON.stringify([
      { agentId: "research", task: "gather" },
      { agentId: "coder", task: "build", dependsOn: [0] },
    ]);
    expect(parsePlan(raw)[1].dependsOn).toEqual([0]);
  });

  it("drops out-of-range and self dependencies", () => {
    const raw = JSON.stringify([
      { agentId: "research", task: "a", dependsOn: [0, 5] },
      { agentId: "coder", task: "b", dependsOn: [0] },
    ]);
    const plan = parsePlan(raw);
    expect(plan[0].dependsOn).toBeUndefined(); // self(0) + out-of-range(5) removed
    expect(plan[1].dependsOn).toEqual([0]);
  });
});

describe("runPlan — parallelism & ordering", () => {
  it("runs independent tasks concurrently and preserves plan order in results", async () => {
    let active = 0;
    let peak = 0;
    const deps: OrchestratorDeps = {
      generate: async () => "",
      runAgent: async (agent) => {
        active++;
        peak = Math.max(peak, active);
        await new Promise((r) => setTimeout(r, 10));
        active--;
        return `[${agent.id}]`;
      },
    };
    const plan = [
      { agentId: "research", task: "a" },
      { agentId: "coder", task: "b" },
      { agentId: "cost", task: "c" },
    ];
    const results = await runPlan(plan, deps);
    expect(results.map((r) => r.agentId)).toEqual([
      "research",
      "coder",
      "cost",
    ]);
    expect(peak).toBeGreaterThan(1); // ran in parallel
  });

  it("respects dependencies and passes predecessor output as context", async () => {
    const order: string[] = [];
    let sawContext = "";
    const deps: OrchestratorDeps = {
      generate: async () => "",
      runAgent: async (agent, task, context) => {
        order.push(agent.id);
        if (agent.id === "coder") sawContext = context ?? "";
        return `[${agent.id}] ${task}`;
      },
    };
    const plan = [
      { agentId: "research", task: "find facts" },
      { agentId: "coder", task: "use them", dependsOn: [0] },
    ];
    await runPlan(plan, deps);
    expect(order).toEqual(["research", "coder"]); // dependency ran first
    expect(sawContext).toContain("[research] find facts");
  });

  it("propagates worker usage/cost and records timing", async () => {
    const deps: OrchestratorDeps = {
      generate: async () => "",
      runAgent: async (agent) => ({
        output: `[${agent.id}]`,
        usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
        cost: 0.002,
      }),
    };
    const [r] = await runPlan([{ agentId: "research", task: "t" }], deps);
    expect(r.usage?.totalTokens).toBe(15);
    expect(r.cost).toBe(0.002);
    expect(typeof r.startedAt).toBe("number");
    expect(r.endedAt).toBeGreaterThanOrEqual(r.startedAt!);
  });
});

describe("orchestrate — streaming events", () => {
  it("emits plan, step-start/done for each task, and answer", async () => {
    const events: OrchestratorEvent[] = [];
    const deps: OrchestratorDeps = {
      generate: async (prompt) =>
        prompt.includes("Decompose the objective") ? plannerJson : "FINAL",
      runAgent: async (agent) => `[${agent.id}]`,
      onEvent: (e) => events.push(e),
    };
    await orchestrate("obj", deps);
    const types = events.map((e) => e.type);
    expect(types[0]).toBe("plan");
    expect(types.filter((t) => t === "step-start")).toHaveLength(2);
    expect(types.filter((t) => t === "step-done")).toHaveLength(2);
    expect(types[types.length - 1]).toBe("answer");
  });
});
