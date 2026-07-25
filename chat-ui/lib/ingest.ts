import type { Project } from "@/lib/storage";

/** A document ready to upload to the mcp-knowledge `ingest_documents` tool. */
export type IngestDocument = {
  id: string;
  title: string;
  content: string;
  source: string;
};

/** Characters per passage when chunking project files for ingestion. */
export const INGEST_CHUNK_SIZE = 1500;

/**
 * Split a project's files into search-index passages. Each file is chunked into
 * ~INGEST_CHUNK_SIZE-character passages; empty passages are dropped. Document
 * ids are stable (`<projectId>-<fileId>-<i>`) so re-ingesting merges rather
 * than duplicates, and each passage is tagged with the project name as source.
 */
export function chunkProjectForIngest(
  project: Pick<Project, "id" | "name" | "files">,
  chunkSize: number = INGEST_CHUNK_SIZE
): IngestDocument[] {
  const size = chunkSize > 0 ? chunkSize : INGEST_CHUNK_SIZE;
  const documents: IngestDocument[] = [];
  for (const f of project.files ?? []) {
    const text = f.content ?? "";
    const parts = Math.max(1, Math.ceil(text.length / size));
    for (let i = 0; i < parts; i++) {
      const slice = text.slice(i * size, (i + 1) * size).trim();
      if (!slice) continue;
      documents.push({
        id: `${project.id}-${f.id}-${i}`,
        title: parts > 1 ? `${f.name} (part ${i + 1}/${parts})` : f.name,
        content: slice,
        source: project.name,
      });
    }
  }
  return documents;
}

/** Flatten an MCP tool result (`{ content: [{ text }] }`) into a string. */
export function toolResultText(result: unknown): string {
  const content = (result as { content?: unknown })?.content;
  if (!Array.isArray(content)) return "";
  return content
    .map((p) => (p as { text?: string })?.text ?? "")
    .join(" ")
    .trim();
}

/**
 * The exact index document keys a single file was ingested as. Deterministic
 * and identical to the ids produced by chunkProjectForIngest, so removing a
 * file can delete precisely its passages from the index.
 */
export function fileIngestKeys(
  projectId: string,
  file: { id: string; content?: string },
  chunkSize: number = INGEST_CHUNK_SIZE
): string[] {
  const size = chunkSize > 0 ? chunkSize : INGEST_CHUNK_SIZE;
  const text = file.content ?? "";
  const parts = Math.max(1, Math.ceil(text.length / size));
  const keys: string[] = [];
  for (let i = 0; i < parts; i++) {
    const slice = text.slice(i * size, (i + 1) * size).trim();
    if (!slice) continue;
    keys.push(`${projectId}-${file.id}-${i}`);
  }
  return keys;
}
