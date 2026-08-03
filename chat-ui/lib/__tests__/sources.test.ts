import { describe, it, expect } from "vitest";
import { extractSources } from "../sources";

describe("extractSources", () => {
  it("extracts markdown links with titles", () => {
    expect(
      extractSources("See [Azure docs](https://learn.microsoft.com/azure).")
    ).toEqual([
      { title: "Azure docs", url: "https://learn.microsoft.com/azure" },
    ]);
  });

  it("extracts bare URLs and trims trailing punctuation", () => {
    expect(extractSources("Ref: https://example.com/page.")).toEqual([
      { title: "https://example.com/page", url: "https://example.com/page" },
    ]);
  });

  it("dedupes by URL and keeps the first (titled) occurrence", () => {
    const s = extractSources(
      "[Home](https://x.io) and again https://x.io here"
    );
    expect(s).toEqual([{ title: "Home", url: "https://x.io" }]);
  });

  it("returns nothing when there are no links", () => {
    expect(extractSources("just some text")).toEqual([]);
    expect(extractSources("")).toEqual([]);
  });
});
