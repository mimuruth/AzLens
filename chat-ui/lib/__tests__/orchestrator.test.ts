import { describe, it, expect } from "vitest";
import {
  parsePlan,
  planTasks,
  orchestrate,
  buildPlannerPrompt,
  MAX_SUBTASKS,
  type OrchestratorDeps,
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
