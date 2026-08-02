import { describe, it, expect } from "vitest";
import { stripMarkdownForSpeech } from "../voice";

describe("stripMarkdownForSpeech", () => {
  it("replaces fenced code blocks with a spoken placeholder", () => {
    const out = stripMarkdownForSpeech("Here:\n```ts\nconst x=1;\n```\nDone");
    expect(out).toContain("code block");
    expect(out).not.toContain("const x");
  });

  it("keeps link text and drops the URL", () => {
    expect(stripMarkdownForSpeech("see [the docs](https://x.io)")).toBe(
      "see the docs"
    );
  });

  it("removes heading markers, emphasis, and table pipes", () => {
    expect(stripMarkdownForSpeech("# Title\n**bold** _italic_")).toBe(
      "Title bold italic"
    );
    expect(stripMarkdownForSpeech("| a | b |")).toBe("a b");
  });

  it("keeps inline code content without backticks", () => {
    expect(stripMarkdownForSpeech("run `npm test` now")).toBe(
      "run npm test now"
    );
  });

  it("collapses whitespace and trims", () => {
    expect(stripMarkdownForSpeech("  a\n\n  b  ")).toBe("a b");
  });
});
