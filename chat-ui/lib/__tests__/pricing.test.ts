import { describe, it, expect } from "vitest";
import { estimateCost } from "../pricing";

describe("estimateCost", () => {
  it("computes cost for a known model", () => {
    // gpt-4o: input $2.5/1M, output $10/1M.
    const cost = estimateCost("gpt-4o", {
      promptTokens: 1_000_000,
      completionTokens: 1_000_000,
    });
    expect(cost).toBeCloseTo(12.5, 6);
  });

  it("prefers the longest matching price key", () => {
    // "gpt-4o-mini" contains both "gpt-4o" and "gpt-4o-mini"; the longer wins.
    const cost = estimateCost("gpt-4o-mini", {
      promptTokens: 1_000_000,
      completionTokens: 0,
    });
    expect(cost).toBeCloseTo(0.15, 6);
  });

  it("prices Claude models", () => {
    expect(
      estimateCost("claude-3-5-sonnet-latest", {
        promptTokens: 1_000_000,
        completionTokens: 0,
      })
    ).toBeCloseTo(3, 6);
    expect(
      estimateCost("claude-3-5-haiku-latest", {
        promptTokens: 0,
        completionTokens: 1_000_000,
      })
    ).toBeCloseTo(4, 6);
  });

  it("returns null for an unknown model", () => {
    expect(
      estimateCost("some-local-model", {
        promptTokens: 100,
        completionTokens: 100,
      })
    ).toBeNull();
  });

  it("returns null when usage is missing or empty", () => {
    expect(estimateCost("gpt-4o", undefined)).toBeNull();
    expect(
      estimateCost("gpt-4o", { promptTokens: 0, completionTokens: 0 })
    ).toBeNull();
  });

  it("is NaN-safe for non-finite token counts", () => {
    const cost = estimateCost("gpt-4o", {
      promptTokens: Number.NaN,
      completionTokens: 1_000_000,
    });
    expect(cost).toBeCloseTo(10, 6);
  });
});
