import type { UIMessage } from "ai";
import {
  type Conversation,
  loadMessages,
  saveMessages,
} from "@/lib/storage";

/** Trigger a browser download of a text file. */
export function downloadFile(
  name: string,
  content: string,
  type: string
): void {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

function messageText(m: UIMessage): string {
  return (
    (m.parts ?? [])
      .filter((p) => p.type === "text")
      .map((p) => (p as { text: string }).text)
      .join("\n") ||
    (m as { content?: string }).content ||
    ""
  );
}

/** Render a single conversation as Markdown. */
export function exportChatMarkdown(convo: Conversation): string {
  const messages = loadMessages(convo.id);
  const lines: string[] = [`# ${convo.title}`, ""];
  for (const m of messages) {
    lines.push(`**${m.role === "user" ? "You" : "AzLens"}:**`, "");
    lines.push(messageText(m), "");
  }
  return lines.join("\n");
}

/** Serialize all conversations (with their messages) to a JSON string. */
export function exportAllJson(conversations: Conversation[]): string {
  return JSON.stringify(
    {
      version: 1,
      exportedAt: new Date().toISOString(),
      conversations: conversations.map((c) => ({
        ...c,
        messages: loadMessages(c.id),
      })),
    },
    null,
    2
  );
}

/**
 * Import conversations from an exported JSON string. Writes their messages to
 * storage and returns the conversation metadata to merge into state.
 */
export function importAllJson(text: string): Conversation[] {
  const data = JSON.parse(text);
  if (!data || !Array.isArray(data.conversations)) {
    throw new Error("Invalid AzLens export file.");
  }
  const imported: Conversation[] = [];
  for (const entry of data.conversations) {
    const { messages, ...meta } = entry as Conversation & {
      messages?: UIMessage[];
    };
    if (!meta.id || typeof meta.title !== "string") continue;
    if (Array.isArray(messages)) saveMessages(meta.id, messages);
    imported.push({
      id: meta.id,
      title: meta.title,
      updatedAt: meta.updatedAt ?? Date.now(),
      renamed: meta.renamed,
      pinned: meta.pinned,
    });
  }
  return imported;
}
