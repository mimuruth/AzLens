/**
 * Feedback → eval export. Returns response-eval case drafts generated from the
 * current user's collected 👍/👎 feedback, ready to drop into the eval dataset.
 *   GET /api/feedback/export?rating=up|down
 */
export const runtime = "nodejs";

import { historyEnabled, userIdFromHeaders, listFeedback } from "@/lib/history";
import { feedbackToEvalCases } from "@/lib/feedback-eval";

export async function GET(req: Request): Promise<Response> {
  if (!historyEnabled()) return Response.json({ enabled: false, cases: [] });
  const userId = userIdFromHeaders(new Headers(req.headers));
  const ratingParam = new URL(req.url).searchParams.get("rating");
  const rating =
    ratingParam === "up" || ratingParam === "down" ? ratingParam : undefined;
  try {
    const records = await listFeedback(userId, rating);
    return Response.json({
      enabled: true,
      cases: feedbackToEvalCases(records),
    });
  } catch (err) {
    console.warn("feedback export failed:", err);
    return Response.json({ enabled: true, cases: [] });
  }
}
