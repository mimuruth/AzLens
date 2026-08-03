import { describe, it, expect } from "vitest";
import { parseImageResult, imageMarkdown } from "../image";

describe("parseImageResult", () => {
  it("reads a URL result", () => {
    expect(parseImageResult({ data: [{ url: "https://x/i.png" }] })).toEqual({
      url: "https://x/i.png",
    });
  });

  it("reads a base64 result", () => {
    expect(parseImageResult({ data: [{ b64_json: "AAAA" }] })).toEqual({
      b64: "AAAA",
    });
  });

  it("returns null for empty/malformed responses", () => {
    expect(parseImageResult({})).toBeNull();
    expect(parseImageResult({ data: [] })).toBeNull();
    expect(parseImageResult(null)).toBeNull();
  });
});

describe("imageMarkdown", () => {
  it("builds a URL image", () => {
    expect(imageMarkdown("a cat", { url: "https://x/i.png" })).toBe(
      "![a cat](https://x/i.png)"
    );
  });

  it("builds an inline base64 image", () => {
    expect(imageMarkdown("logo", { b64: "AAAA" })).toBe(
      "![logo](data:image/png;base64,AAAA)"
    );
  });

  it("returns empty string when there is no source", () => {
    expect(imageMarkdown("x", {})).toBe("");
  });
});
