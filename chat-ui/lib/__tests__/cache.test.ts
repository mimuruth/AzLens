import { describe, it, expect } from "vitest";
import { cacheKey } from "../cache";

const base = {
  agentId: "general",
  provider: "openai",
  model: "gpt-4o",
  system: "You are helpful.",
  messages: [{ role: "user", content: "hi" }],
};

describe("cacheKey", () => {
  it("is deterministic and prefixed", () => {
    const k = cacheKey(base);
    expect(k).toMatch(/^resp:[0-9a-f]{64}$/);
    expect(cacheKey(base)).toBe(k);
  });

  it("changes when any input changes", () => {
    const k = cacheKey(base);
    expect(cacheKey({ ...base, model: "gpt-4o-mini" })).not.toBe(k);
    expect(cacheKey({ ...base, system: "different" })).not.toBe(k);
    expect(
      cacheKey({ ...base, messages: [{ role: "user", content: "bye" }] })
    ).not.toBe(k);
    expect(cacheKey({ ...base, agentId: "coder" })).not.toBe(k);
  });
});
