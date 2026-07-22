/**
 * Conversation history API (Cosmos DB-backed).
 *   GET    /api/history        -> { enabled, conversations: meta[] }
 *   POST   /api/history        -> upsert { conversation, messages }
 *   DELETE /api/history?id=<id> -> delete one conversation
 * When Cosmos is not configured, GET reports enabled:false and writes no-op.
 */
export const runtime = "nodejs";

import {
  historyEnabled,
  userIdFromHeaders,
  listConversations,
  upsertConversation,
  deleteConversation,
} from "@/lib/history";

export async function GET(req: Request): Promise<Response> {
  if (!historyEnabled()) {
    return Response.json({ enabled: false, conversations: [] });
  }
  const userId = userIdFromHeaders(new Headers(req.headers));
  try {
    const conversations = await listConversations(userId);
    return Response.json({ enabled: true, conversations });
  } catch (err) {
    console.warn("history GET failed:", err);
    return Response.json({ enabled: false, conversations: [] });
  }
}

export async function POST(req: Request): Promise<Response> {
  if (!historyEnabled()) return Response.json({ ok: false, enabled: false });
  const userId = userIdFromHeaders(new Headers(req.headers));
  const body = await req.json().catch(() => null);
  const conversation = body?.conversation;
  const messages = body?.messages ?? [];
  if (!conversation?.id) {
    return new Response("Missing conversation.id", { status: 400 });
  }
  try {
    await upsertConversation(userId, conversation, messages);
    return Response.json({ ok: true });
  } catch (err) {
    console.warn("history POST failed:", err);
    return Response.json({ ok: false });
  }
}

export async function DELETE(req: Request): Promise<Response> {
  if (!historyEnabled()) return Response.json({ ok: false, enabled: false });
  const userId = userIdFromHeaders(new Headers(req.headers));
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return new Response("Missing id", { status: 400 });
  try {
    await deleteConversation(userId, id);
    return Response.json({ ok: true });
  } catch (err) {
    console.warn("history DELETE failed:", err);
    return Response.json({ ok: false });
  }
}
