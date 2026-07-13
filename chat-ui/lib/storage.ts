import type { UIMessage } from "ai";

export type Conversation = {
  id: string;
  title: string;
  updatedAt: number;
};

const CONVOS_KEY = "azlens.conversations";
const ACTIVE_KEY = "azlens.active";
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
