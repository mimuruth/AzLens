import { describe, it, expect } from "vitest";
import { feedbackToEvalCases, type FeedbackRecord } from "../feedback-eval";

const rec = (r: Partial<FeedbackRecord>): FeedbackRecord => ({
  messageId: "m",
  convoId: "c",
  rating: "up",
  ...r,
});

describe("feedbackToEvalCases", () => {
  it("skips records without a prompt", () => {
    expect(feedbackToEvalCases([rec({ prompt: "" })])).toEqual([]);
    expect(feedbackToEvalCases([rec({})])).toEqual([]);
  });

  it("turns 👍 into a positive regression judge case", () => {
    const [c] = feedbackToEvalCases([
      rec({ rating: "up", prompt: "What is 2+2?" }),
    ]);
    expect(c.prompt).toBe("What is 2+2?");
    expect(c.name.startsWith("👍")).toBe(true);
    expect(c.assertions[0]).toMatchObject({ type: "judge" });
    expect((c.assertions[0] as { rubric: string }).rubric).toMatch(/helpful/i);
  });

  it("turns 👎 into a guard referencing the reason", () => {
    const [c] = feedbackToEvalCases([
      rec({ rating: "down", prompt: "Explain X", reason: "was too vague" }),
    ]);
    expect(c.name.startsWith("👎")).toBe(true);
    expect((c.assertions[0] as { rubric: string }).rubric).toContain(
      "too vague"
    );
  });

  it("truncates the case name from a long prompt", () => {
    const [c] = feedbackToEvalCases([rec({ prompt: "p".repeat(200) })]);
    expect(c.name.length).toBeLessThanOrEqual(64);
  });
});
