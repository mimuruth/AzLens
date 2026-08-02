/**
 * Feedback API (Cosmos-backed, same container). POST records a 👍/👎 rating for
 * an assistant message. No-op when Cosmos is not configured.
 *   POST /api/feedback  -> { convoId, messageId, rating, reason? }
 */
export const runtime = "nodejs";

import {
  historyEnabled,
  userIdFromHeaders,
  upsertFeedback,
} from "@/lib/history";
import { redactAndClamp } from "@/lib/redact";

export async function POST(req: Request): Promise<Response> {
  if (!historyEnabled()) return Response.json({ ok: false, enabled: false });
  const userId = userIdFromHeaders(new Headers(req.headers));
  const body = await req.json().catch(() => null);
  const convoId = body?.convoId;
  const messageId = body?.messageId;
  const rating = body?.rating;
  if (!convoId || !messageId || (rating !== "up" && rating !== "down")) {
    return new Response("Missing convoId / messageId / rating", {
      status: 400,
    });
  }
  // Redact PII from free text before it's persisted.
  const clean = (v: unknown) =>
    typeof v === "string" && v.trim() ? redactAndClamp(v) : undefined;
  try {
    await upsertFeedback(userId, {
      convoId,
      messageId,
      rating,
      reason: clean(body?.reason),
      prompt: clean(body?.prompt),
      answer: clean(body?.answer),
    });
    return Response.json({ ok: true });
  } catch (err) {
    console.warn("feedback POST failed:", err);
    return Response.json({ ok: false });
  }
}
