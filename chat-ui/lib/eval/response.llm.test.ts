import { describe, it, expect } from "vitest";
import { generateText } from "ai";
import { getModel } from "../model";
import {
  runResponseEval,
  formatResponseReport,
  type GenerateFn,
  type JudgeFn,
} from "./response-eval";
import { RESPONSE_CASES } from "./response-cases";

// Opt-in, live-model eval — runs only via `npm run eval:llm` (separate Vitest
// config), never in the default `npm test`. Skips cleanly when no provider is
// configured so it can't fail an environment without keys.
function providerConfigured(): boolean {
  return Boolean(
    process.env.AZURE_OPENAI_API_KEY ||
    process.env.OPENAI_API_KEY ||
    process.env.ANTHROPIC_API_KEY ||
    process.env.LOCAL_OPENAI_BASE_URL
  );
}

describe.skipIf(!providerConfigured())("response eval (live model)", () => {
  it("meets the response-quality pass floor", async () => {
    const model = getModel();

    const generate: GenerateFn = async (prompt, system) => {
      const { text } = await generateText({
        model,
        system,
        prompt,
        temperature: 0,
        maxTokens: 400,
      });
      return text;
    };

    const judge: JudgeFn = async (rubric, prompt, answer) => {
      const { text } = await generateText({
        model,
        temperature: 0,
        maxTokens: 200,
        prompt:
          "You are grading an AI answer against a rubric. Reply with PASS or FAIL " +
          "on the first line, then a one-line reason.\n\n" +
          `Rubric: ${rubric}\n\nUser prompt: ${prompt}\n\nAnswer: ${answer}`,
      });
      return {
        pass: /^\s*pass/i.test(text),
        reason: text.split("\n").slice(1).join(" ").trim() || text.trim(),
      };
    };

    const report = await runResponseEval(RESPONSE_CASES, { generate, judge });
    // eslint-disable-next-line no-console
    console.log("\n" + formatResponseReport(report) + "\n");
    const floor = Number(process.env.EVAL_PASS_FLOOR ?? "0.8");
    expect(report.passRate).toBeGreaterThanOrEqual(floor);
  }, 120_000);
});
