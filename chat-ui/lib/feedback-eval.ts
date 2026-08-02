import type { ResponseCase } from "./eval/response-eval";

/**
 * Feedback → eval flywheel: turn collected 👍/👎 ratings into draft
 * response-eval cases. 👍 becomes a regression check (the answer should stay
 * good); 👎 becomes a guard against the reported problem. Judge-based so a
 * human can refine the rubric later. Pure and unit-tested.
 */

export type FeedbackRecord = {
  messageId: string;
  convoId: string;
  rating: "up" | "down";
  reason?: string;
  prompt?: string;
  answer?: string;
  createdAt?: number;
};

export function feedbackToEvalCases(records: FeedbackRecord[]): ResponseCase[] {
  return records
    .filter((r) => (r.prompt ?? "").trim().length > 0)
    .map((r) => {
      const rubric =
        r.rating === "up"
          ? "The answer is helpful, correct, and on-topic for the prompt."
          : `The answer avoids the problem a user reported: ${
              r.reason?.trim() || "the earlier answer was rated unhelpful"
            }.`;
      const tag = r.rating === "up" ? "👍" : "👎";
      const prompt = r.prompt as string;
      return {
        name: `${tag} ${prompt.replace(/\s+/g, " ").slice(0, 60)}`,
        prompt,
        assertions: [{ type: "judge", rubric }],
      };
    });
}
