import { describe, it, expect } from "vitest";
import type { CoreMessage } from "ai";
import {
  estimateTokens,
  totalTokens,
  needsCompaction,
  splitForCompaction,
  transcript,
} from "../compaction";

const msg = (role: "user" | "assistant", text: string): CoreMessage =>
  ({ role, content: text }) as CoreMessage;

describe("estimateTokens", () => {
  it("approximates ~4 chars per token", () => {
    expect(estimateTokens("12345678")).toBe(2);
    expect(estimateTokens("")).toBe(0);
  });
});

describe("needsCompaction", () => {
  const many = Array.from({ length: 12 }, (_, i) =>
    msg("user", "x".repeat(400))
  );

  it("triggers when over the token budget and long enough", () => {
    expect(needsCompaction(many, 500, 6)).toBe(true);
  });

  it("does not trigger when under budget", () => {
    expect(needsCompaction(many, 1_000_000, 6)).toBe(false);
  });

  it("does not trigger when there are too few messages to compact", () => {
    expect(needsCompaction([msg("user", "hi")], 1, 6)).toBe(false);
  });

  it("is disabled when maxTokens <= 0", () => {
    expect(needsCompaction(many, 0, 6)).toBe(false);
  });
});

describe("splitForCompaction", () => {
  it("keeps the last N messages verbatim and returns the rest as older", () => {
    const list = Array.from({ length: 10 }, (_, i) => msg("user", `m${i}`));
    const { older, recent } = splitForCompaction(list, 3);
    expect(recent).toHaveLength(3);
    expect(older).toHaveLength(7);
    expect((recent[2] as { content: string }).content).toBe("m9");
  });

  it("returns everything as recent when short", () => {
    const list = [msg("user", "a"), msg("assistant", "b")];
    expect(splitForCompaction(list, 5)).toEqual({ older: [], recent: list });
  });
});

describe("transcript", () => {
  it("renders role: text lines", () => {
    expect(transcript([msg("user", "hi"), msg("assistant", "yo")])).toBe(
      "user: hi\nassistant: yo"
    );
  });
});

describe("totalTokens", () => {
  it("sums estimated tokens across messages", () => {
    expect(totalTokens([msg("user", "1234"), msg("assistant", "5678")])).toBe(
      2
    );
  });
});
