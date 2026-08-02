import type { CoreMessage } from "ai";

/**
 * Context-window management: when a conversation grows past a token budget,
 * summarize the older turns and keep only the most recent verbatim. These are
 * pure helpers (token estimate, split); the /api/chat route does the summary
 * model call. Unit-tested.
 */

/** Rough token estimate (~4 chars/token) — good enough for a budget check. */
export function estimateTokens(text: string): number {
  return Math.ceil((text?.length ?? 0) / 4);
}

export function coreMessageText(m: CoreMessage): string {
  const c = (m as { content?: unknown }).content;
  if (typeof c === "string") return c;
  if (Array.isArray(c)) {
    return c
      .map((p) =>
        typeof p === "object" && p && "text" in p
          ? String((p as { text?: unknown }).text ?? "")
          : ""
      )
      .join(" ");
  }
  return "";
}

export function totalTokens(messages: CoreMessage[]): number {
  return messages.reduce((s, m) => s + estimateTokens(coreMessageText(m)), 0);
}

export function needsCompaction(
  messages: CoreMessage[],
  maxTokens: number,
  keepRecent: number
): boolean {
  return (
    maxTokens > 0 &&
    messages.length > keepRecent + 1 &&
    totalTokens(messages) > maxTokens
  );
}

export function splitForCompaction(
  messages: CoreMessage[],
  keepRecent: number
): { older: CoreMessage[]; recent: CoreMessage[] } {
  if (messages.length <= keepRecent) return { older: [], recent: messages };
  const cut = messages.length - keepRecent;
  return { older: messages.slice(0, cut), recent: messages.slice(cut) };
}

/** Render older messages as a plain transcript for the summariser prompt. */
export function transcript(messages: CoreMessage[]): string {
  return messages
    .map((m) => `${m.role}: ${coreMessageText(m)}`)
    .filter((l) => l.trim().length > 0)
    .join("\n");
}
