import { describe, it, expect } from "vitest";
import type { CoreMessage } from "ai";
import { classifyComplexity, lastUserText } from "../router";

describe("classifyComplexity", () => {
  it("treats short greetings as simple", () => {
    expect(classifyComplexity("hi there").tier).toBe("simple");
    expect(classifyComplexity("thanks!").tier).toBe("simple");
  });

  it("flags code / reasoning requests as complex", () => {
    const c = classifyComplexity(
      "Refactor this function and optimize the algorithm:\n```ts\nfunction f(){}\n```"
    );
    expect(c.tier).toBe("complex");
    expect(c.signals).toContain("code");
  });

  it("flags long, multi-part requests as complex", () => {
    const text =
      "Please compare each of these options step-by-step and explain the trade-offs " +
      "in detail across multiple files and resources so I understand the design.";
    expect(classifyComplexity(text).tier).toBe("complex");
  });

  it("handles empty input without throwing", () => {
    expect(classifyComplexity("").tier).toBe("simple");
  });
});

describe("lastUserText", () => {
  it("returns the most recent user message string", () => {
    const messages: CoreMessage[] = [
      { role: "user", content: "first" },
      { role: "assistant", content: "reply" },
      { role: "user", content: "second" },
    ];
    expect(lastUserText(messages)).toBe("second");
  });

  it("extracts text from array content parts", () => {
    const messages: CoreMessage[] = [
      {
        role: "user",
        content: [{ type: "text", text: "hello world" }],
      },
    ];
    expect(lastUserText(messages)).toBe("hello world");
  });

  it("returns an empty string when there are no messages", () => {
    expect(lastUserText(undefined)).toBe("");
    expect(lastUserText([])).toBe("");
  });
});
