/**
 * Response-quality eval harness (opt-in, live model, non-CI).
 *
 * Scores a model's actual outputs against per-case assertions
 * (contains / regex / json shape / min length) and an optional LLM-as-judge.
 * The scorer is provider-agnostic: it takes a `generate` (and optional `judge`)
 * callback so the same logic works for any configured model. Reuses the report
 * shape of the deterministic router eval.
 */

export type Assertion =
  | { type: "contains"; value: string; ci?: boolean }
  | { type: "notContains"; value: string; ci?: boolean }
  | { type: "regex"; value: string; flags?: string }
  | { type: "minWords"; value: number }
  | { type: "json"; keys?: string[] }
  | { type: "judge"; rubric: string };

export type ResponseCase = {
  name: string;
  prompt: string;
  system?: string;
  assertions: Assertion[];
};

export type GenerateFn = (prompt: string, system?: string) => Promise<string>;
export type JudgeFn = (
  rubric: string,
  prompt: string,
  answer: string
) => Promise<{ pass: boolean; reason: string }>;

export type AssertionResult = {
  label: string;
  pass: boolean;
  detail?: string;
};
export type CaseOutcome = {
  name: string;
  pass: boolean;
  checks: AssertionResult[];
  output: string;
  error?: string;
};
export type ResponseReport = {
  total: number;
  passed: number;
  passRate: number;
  cases: CaseOutcome[];
};

/** Strip a leading ```json / ``` fence so JSON assertions can parse output. */
function unfence(text: string): string {
  const m = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  return (m ? m[1] : text).trim();
}

async function checkAssertion(
  a: Assertion,
  output: string,
  prompt: string,
  judge?: JudgeFn
): Promise<AssertionResult> {
  switch (a.type) {
    case "contains": {
      const hay = a.ci ? output.toLowerCase() : output;
      const needle = a.ci ? a.value.toLowerCase() : a.value;
      return { label: `contains "${a.value}"`, pass: hay.includes(needle) };
    }
    case "notContains": {
      const hay = a.ci ? output.toLowerCase() : output;
      const needle = a.ci ? a.value.toLowerCase() : a.value;
      return {
        label: `not contains "${a.value}"`,
        pass: !hay.includes(needle),
      };
    }
    case "regex": {
      const re = new RegExp(a.value, a.flags);
      return {
        label: `regex /${a.value}/${a.flags ?? ""}`,
        pass: re.test(output),
      };
    }
    case "minWords": {
      const words = output.trim() ? output.trim().split(/\s+/).length : 0;
      return {
        label: `>= ${a.value} words`,
        pass: words >= a.value,
        detail: `got ${words}`,
      };
    }
    case "json": {
      try {
        const parsed = JSON.parse(unfence(output));
        const missing = (a.keys ?? []).filter(
          (k) => !(parsed && typeof parsed === "object" && k in parsed)
        );
        return {
          label: `valid json${a.keys ? ` with keys [${a.keys.join(", ")}]` : ""}`,
          pass: missing.length === 0,
          detail: missing.length ? `missing ${missing.join(", ")}` : undefined,
        };
      } catch {
        return { label: "valid json", pass: false, detail: "parse failed" };
      }
    }
    case "judge": {
      if (!judge)
        return { label: "judge", pass: false, detail: "no judge configured" };
      const verdict = await judge(a.rubric, prompt, output);
      return {
        label: `judge: ${a.rubric}`,
        pass: verdict.pass,
        detail: verdict.reason,
      };
    }
  }
}

export async function runResponseEval(
  cases: ResponseCase[],
  opts: { generate: GenerateFn; judge?: JudgeFn }
): Promise<ResponseReport> {
  const outcomes: CaseOutcome[] = [];
  for (const c of cases) {
    let output = "";
    let error: string | undefined;
    try {
      output = await opts.generate(c.prompt, c.system);
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    }
    const checks = error
      ? []
      : await Promise.all(
          c.assertions.map((a) =>
            checkAssertion(a, output, c.prompt, opts.judge)
          )
        );
    outcomes.push({
      name: c.name,
      pass: !error && checks.every((x) => x.pass),
      checks,
      output,
      error,
    });
  }
  const passed = outcomes.filter((o) => o.pass).length;
  return {
    total: outcomes.length,
    passed,
    passRate: outcomes.length ? passed / outcomes.length : 0,
    cases: outcomes,
  };
}

export function formatResponseReport(r: ResponseReport): string {
  const pct = (n: number) => `${(n * 100).toFixed(1)}%`;
  const lines: string[] = [];
  lines.push("Response eval — model output quality");
  lines.push("─".repeat(48));
  lines.push(`Cases:    ${r.total}`);
  lines.push(`Pass:     ${pct(r.passRate)}  (${r.passed}/${r.total})`);
  lines.push("");
  for (const c of r.cases) {
    const mark = c.pass ? "✓" : "✗";
    lines.push(`${mark} ${c.name}`);
    if (c.error) {
      lines.push(`    error: ${c.error}`);
      continue;
    }
    for (const chk of c.checks.filter((x) => !x.pass)) {
      lines.push(`    ✗ ${chk.label}${chk.detail ? ` (${chk.detail})` : ""}`);
    }
  }
  return lines.join("\n");
}
