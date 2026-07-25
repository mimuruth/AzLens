import { describe, it, expect } from "vitest";
import {
  chunkProjectForIngest,
  toolResultText,
  INGEST_CHUNK_SIZE,
} from "../ingest";

const project = (files: { id: string; name: string; content: string }[]) => ({
  id: "proj1",
  name: "My Project",
  files: files.map((f) => ({ ...f, size: f.content.length })),
});

describe("chunkProjectForIngest", () => {
  it("returns nothing for a project with no files", () => {
    expect(chunkProjectForIngest({ id: "p", name: "n", files: [] })).toEqual(
      []
    );
    expect(chunkProjectForIngest({ id: "p", name: "n" })).toEqual([]);
  });

  it("emits one document for a short file, tagged with the project name", () => {
    const docs = chunkProjectForIngest(
      project([{ id: "f1", name: "notes.md", content: "hello world" }])
    );
    expect(docs).toHaveLength(1);
    expect(docs[0]).toEqual({
      id: "proj1-f1-0",
      title: "notes.md",
      content: "hello world",
      source: "My Project",
    });
  });

  it("splits a long file into numbered passages", () => {
    const content = "x".repeat(INGEST_CHUNK_SIZE * 2 + 10);
    const docs = chunkProjectForIngest(
      project([{ id: "f1", name: "big.txt", content }])
    );
    expect(docs).toHaveLength(3);
    expect(docs.map((d) => d.id)).toEqual([
      "proj1-f1-0",
      "proj1-f1-1",
      "proj1-f1-2",
    ]);
    expect(docs[0].title).toBe("big.txt (part 1/3)");
    expect(docs[2].title).toBe("big.txt (part 3/3)");
    expect(docs[0].content).toHaveLength(INGEST_CHUNK_SIZE);
  });

  it("respects a custom chunk size and drops empty/whitespace passages", () => {
    const docs = chunkProjectForIngest(
      project([{ id: "f1", name: "a.txt", content: "abcdef" }]),
      3
    );
    expect(docs.map((d) => d.content)).toEqual(["abc", "def"]);
  });

  it("produces stable ids across files so re-ingest merges", () => {
    const docs = chunkProjectForIngest(
      project([
        { id: "f1", name: "a.txt", content: "one" },
        { id: "f2", name: "b.txt", content: "two" },
      ])
    );
    expect(docs.map((d) => d.id)).toEqual(["proj1-f1-0", "proj1-f2-0"]);
  });
});

describe("toolResultText", () => {
  it("flattens MCP content parts into a string", () => {
    expect(
      toolResultText({ content: [{ text: "Ingested 3" }, { text: "docs." }] })
    ).toBe("Ingested 3 docs.");
  });

  it("returns an empty string for malformed results", () => {
    expect(toolResultText(null)).toBe("");
    expect(toolResultText({})).toBe("");
    expect(toolResultText({ content: "nope" })).toBe("");
  });
});
