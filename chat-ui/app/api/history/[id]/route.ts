/**
 * Messages for a single conversation (Cosmos DB-backed).
 *   GET /api/history/<id> -> { messages }
 * Returns an empty list when Cosmos is not configured or the id is unknown.
 */
export const runtime = "nodejs";

import {
  historyEnabled,
  userIdFromHeaders,
  getConversation,
} from "@/lib/history";

export async function GET(
  req: Request,
  { params }: { params: { id: string } }
): Promise<Response> {
  if (!historyEnabled()) return Response.json({ messages: [] });
  const userId = userIdFromHeaders(new Headers(req.headers));
  try {
    const convo = await getConversation(userId, params.id);
    return Response.json({ messages: convo?.messages ?? [] });
  } catch (err) {
    console.warn("history/[id] GET failed:", err);
    return Response.json({ messages: [] });
  }
}
