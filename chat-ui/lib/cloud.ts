import type { UIMessage } from "ai";
import type { Conversation } from "./storage";

/**
 * Client-side bridge to the server's Cosmos-backed history API. When the server
 * has Cosmos configured, conversations are mirrored to the cloud (write-through)
 * and hydrated on a fresh device. When it isn't, every function is a safe no-op
 * and the app keeps using localStorage only.
 */

let enabled: boolean | null = null;

/** Probe the server once and return the cloud state + any stored conversations. */
export async function cloudInit(): Promise<{
  enabled: boolean;
  conversations: Conversation[];
}> {
  try {
    const res = await fetch("/api/history", { cache: "no-store" });
    if (!res.ok) {
      enabled = false;
      return { enabled: false, conversations: [] };
    }
    const data = (await res.json()) as {
      enabled?: boolean;
      conversations?: Conversation[];
    };
    enabled = data.enabled === true;
    return {
      enabled,
      conversations: data.conversations ?? [],
    };
  } catch {
    enabled = false;
    return { enabled: false, conversations: [] };
  }
}

export function cloudEnabled(): boolean {
  return enabled === true;
}

/** Fetch the stored messages for one conversation (empty when disabled). */
export async function cloudMessages(id: string): Promise<UIMessage[]> {
  if (!cloudEnabled()) return [];
  try {
    const res = await fetch(`/api/history/${encodeURIComponent(id)}`, {
      cache: "no-store",
    });
    if (!res.ok) return [];
    const data = (await res.json()) as { messages?: UIMessage[] };
    return data.messages ?? [];
  } catch {
    return [];
  }
}

const timers: Record<string, ReturnType<typeof setTimeout>> = {};

/** Debounced write-through of a conversation + its messages to the cloud. */
export function cloudSave(
  conversation: Conversation,
  messages: UIMessage[]
): void {
  if (!cloudEnabled()) return;
  clearTimeout(timers[conversation.id]);
  timers[conversation.id] = setTimeout(() => {
    fetch("/api/history", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ conversation, messages }),
    }).catch(() => {});
  }, 1200);
}

/** Delete a conversation from the cloud. */
export function cloudDelete(id: string): void {
  if (!cloudEnabled()) return;
  fetch(`/api/history?id=${encodeURIComponent(id)}`, {
    method: "DELETE",
  }).catch(() => {});
}
