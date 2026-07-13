import type { UIMessage } from "ai";

export type Conversation = {
  id: string;
  title: string;
  updatedAt: number;
  /** True once the user has manually renamed the chat (stops auto-titling). */
  renamed?: boolean;
  /** Pinned chats show in a dedicated section above the date groups. */
  pinned?: boolean;
};

export type Theme = "light" | "dark";

const CONVOS_KEY = "azlens.conversations";
const ACTIVE_KEY = "azlens.active";
const THEME_KEY = "azlens.theme";
const messagesKey = (id: string) => `azlens.messages.${id}`;

const hasWindow = () => typeof window !== "undefined";

export function newId(): string {
  if (hasWindow() && "randomUUID" in crypto) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function loadConversations(): Conversation[] {
  if (!hasWindow()) return [];
  try {
    return JSON.parse(localStorage.getItem(CONVOS_KEY) ?? "[]");
  } catch {
    return [];
  }
}

export function saveConversations(list: Conversation[]): void {
  if (hasWindow()) localStorage.setItem(CONVOS_KEY, JSON.stringify(list));
}

export function loadMessages(id: string): UIMessage[] {
  if (!hasWindow()) return [];
  try {
    return JSON.parse(localStorage.getItem(messagesKey(id)) ?? "[]");
  } catch {
    return [];
  }
}

export function saveMessages(id: string, messages: UIMessage[]): void {
  if (hasWindow()) {
    localStorage.setItem(messagesKey(id), JSON.stringify(messages));
  }
}

export function deleteMessages(id: string): void {
  if (hasWindow()) localStorage.removeItem(messagesKey(id));
}

export function loadActive(): string | null {
  return hasWindow() ? localStorage.getItem(ACTIVE_KEY) : null;
}

export function saveActive(id: string): void {
  if (hasWindow()) localStorage.setItem(ACTIVE_KEY, id);
}

export function loadTheme(): Theme {
  if (!hasWindow()) return "light";
  return localStorage.getItem(THEME_KEY) === "dark" ? "dark" : "light";
}

export function saveTheme(theme: Theme): void {
  if (hasWindow()) localStorage.setItem(THEME_KEY, theme);
}

export type ModelSelection = { provider: string; model: string };
export type ModelProvider = { id: string; label: string; models: string[] };
const MODEL_KEY = "azlens.model";

export function loadModel(): ModelSelection | null {
  if (!hasWindow()) return null;
  try {
    const raw = localStorage.getItem(MODEL_KEY);
    return raw ? (JSON.parse(raw) as ModelSelection) : null;
  } catch {
    return null;
  }
}

export function saveModel(sel: ModelSelection): void {
  if (hasWindow()) localStorage.setItem(MODEL_KEY, JSON.stringify(sel));
}

/** Group conversations (already sorted newest-first) into date buckets. */
export function groupByDate(
  list: Conversation[]
): { label: string; items: Conversation[] }[] {
  const now = new Date();
  const startOfDay = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate()
  ).getTime();
  const yesterday = startOfDay - 86_400_000;
  const week = startOfDay - 7 * 86_400_000;

  const buckets: { label: string; items: Conversation[] }[] = [
    { label: "Today", items: [] },
    { label: "Yesterday", items: [] },
    { label: "Previous 7 days", items: [] },
    { label: "Older", items: [] },
  ];

  for (const c of list) {
    if (c.updatedAt >= startOfDay) buckets[0].items.push(c);
    else if (c.updatedAt >= yesterday) buckets[1].items.push(c);
    else if (c.updatedAt >= week) buckets[2].items.push(c);
    else buckets[3].items.push(c);
  }

  return buckets.filter((b) => b.items.length > 0);
}

/** Derive a short conversation title from the first user message. */
export function titleFromMessages(messages: UIMessage[]): string | null {
  const firstUser = messages.find((m) => m.role === "user");
  if (!firstUser) return null;
  const text =
    (firstUser.parts ?? [])
      .filter((p) => p.type === "text")
      .map((p) => (p as { text: string }).text)
      .join(" ")
      .trim() ||
    (firstUser as { content?: string }).content ||
    "";
  if (!text) return null;
  return text.length > 42 ? `${text.slice(0, 42)}…` : text;
}
