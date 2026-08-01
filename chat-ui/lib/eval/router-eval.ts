import { classifyComplexity, type Tier } from "../router";
import { ROUTER_CASES, type RouterCase } from "./router-cases";

/**
 * Deterministic eval harness for the complexity router. Runs the labeled
 * dataset through `classifyComplexity`, computes accuracy plus per-class
 * precision/recall/F1 (treating "complex" as the positive class), and lists
 * every misroute so regressions are visible. No LLM call, no cost — safe for CI.
 */

export type CaseResult = {
  prompt: string;
  expected: Tier;
  actual: Tier;
  score: number;
  signals: string[];
  correct: boolean;
  hard: boolean;
};

export type EvalReport = {
  total: number;
  correct: number;
  accuracy: number;
  // Confusion matrix (positive class = "complex").
  tp: number; // complex predicted complex
  tn: number; // simple predicted simple
  fp: number; // simple predicted complex
  fn: number; // complex predicted simple
  precision: number;
  recall: number;
  f1: number;
  results: CaseResult[];
  failures: CaseResult[];
};

export function evaluateRouter(cases: RouterCase[] = ROUTER_CASES): EvalReport {
  const results: CaseResult[] = cases.map((c) => {
    const { tier, score, signals } = classifyComplexity(c.prompt);
    return {
      prompt: c.prompt,
      expected: c.expected,
      actual: tier,
      score,
      signals,
      correct: tier === c.expected,
      hard: c.hard ?? false,
    };
  });

  let tp = 0;
  let tn = 0;
  let fp = 0;
  let fn = 0;
  for (const r of results) {
    if (r.expected === "complex" && r.actual === "complex") tp++;
    else if (r.expected === "simple" && r.actual === "simple") tn++;
    else if (r.expected === "simple" && r.actual === "complex") fp++;
    else fn++;
  }

  const correct = tp + tn;
  const total = results.length;
  const div = (a: number, b: number) => (b === 0 ? 0 : a / b);
  const precision = div(tp, tp + fp);
  const recall = div(tp, tp + fn);
  const f1 = div(2 * precision * recall, precision + recall);

  return {
    total,
    correct,
    accuracy: div(correct, total),
    tp,
    tn,
    fp,
    fn,
    precision,
    recall,
    f1,
    results,
    failures: results.filter((r) => !r.correct),
  };
}

const pct = (n: number) => `${(n * 100).toFixed(1)}%`;

/** Human-readable report for the CLI / test output. */
export function formatReport(r: EvalReport): string {
  const lines: string[] = [];
  lines.push("Router eval — complexity classification");
  lines.push("─".repeat(48));
  lines.push(`Cases:     ${r.total}`);
  lines.push(`Accuracy:  ${pct(r.accuracy)}  (${r.correct}/${r.total})`);
  lines.push(
    `Precision: ${pct(r.precision)}   Recall: ${pct(r.recall)}   F1: ${pct(r.f1)}   (positive = complex)`
  );
  lines.push("");
  lines.push("Confusion (rows = expected, cols = predicted)");
  lines.push("              simple   complex");
  lines.push(
    `  simple      ${String(r.tn).padStart(6)}   ${String(r.fp).padStart(7)}`
  );
  lines.push(
    `  complex     ${String(r.fn).padStart(6)}   ${String(r.tp).padStart(7)}`
  );

  if (r.failures.length > 0) {
    lines.push("");
    lines.push(`Misroutes (${r.failures.length}):`);
    for (const f of r.failures) {
      const tag = f.hard ? " [known-hard]" : "";
      const prompt = f.prompt.replace(/\s+/g, " ").slice(0, 66);
      lines.push(
        `  expected ${f.expected} → got ${f.actual} (score ${f.score})${tag}: ${prompt}`
      );
    }
  }
  return lines.join("\n");
}
