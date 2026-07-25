import type { UIMessage } from "ai";
import { messageText } from "@/lib/storage";

/**
 * An "artifact" is a fenced code/doc block the assistant produced. We extract
 * them from a conversation so they can be browsed, copied, and downloaded in a
 * side panel (Claude-style).
 */
export type Artifact = {
  id: string;
  lang: string;
  content: string;
  lines: number;
};

const FENCE = /```([\w+#.-]*)\r?\n([\s\S]*?)```/g;

/** Pull all non-empty fenced blocks from the assistant messages, in order. */
export function extractArtifacts(messages: UIMessage[]): Artifact[] {
  const out: Artifact[] = [];
  let n = 0;
  for (const m of messages) {
    if (m.role !== "assistant") continue;
    const text = messageText(m);
    FENCE.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = FENCE.exec(text)) !== null) {
      const lang = (match[1] || "text").toLowerCase();
      const content = match[2].replace(/\s+$/, "");
      if (content.trim().length === 0) continue;
      n += 1;
      out.push({
        id: `${m.id}-${n}`,
        lang,
        content,
        lines: content.split("\n").length,
      });
    }
  }
  return out;
}

const EXT: Record<string, string> = {
  typescript: "ts",
  ts: "ts",
  javascript: "js",
  js: "js",
  tsx: "tsx",
  jsx: "jsx",
  python: "py",
  py: "py",
  json: "json",
  bash: "sh",
  shell: "sh",
  sh: "sh",
  powershell: "ps1",
  sql: "sql",
  yaml: "yaml",
  yml: "yml",
  bicep: "bicep",
  css: "css",
  html: "html",
  markdown: "md",
  md: "md",
  csv: "csv",
  text: "txt",
};

/** A sensible download filename for an artifact. */
export function artifactFileName(a: Artifact): string {
  const ext = EXT[a.lang] ?? "txt";
  return `artifact-${a.id}.${ext}`;
}
