import { describe, it, expect } from "vitest";
import { redactPII, redactAndClamp } from "../redact";

describe("redactPII", () => {
  it("redacts emails", () => {
    expect(redactPII("reach me at jane.doe@example.com please")).toBe(
      "reach me at [email] please"
    );
  });

  it("redacts phone, SSN, and card-like numbers", () => {
    expect(redactPII("call +1 415 555 1234")).toContain("[phone]");
    expect(redactPII("ssn 123-45-6789")).toContain("[ssn]");
    expect(redactPII("card 4111 1111 1111 1111")).toContain("[card]");
  });

  it("redacts api-key-like tokens", () => {
    expect(redactPII("key sk-abcdefghijklmnopqrstuv")).toContain("[token]");
  });

  it("leaves benign text untouched", () => {
    expect(redactPII("the answer was too vague")).toBe(
      "the answer was too vague"
    );
  });
});

describe("redactAndClamp", () => {
  it("clamps long text after redacting", () => {
    const out = redactAndClamp("x".repeat(50), 10);
    expect(out.length).toBeLessThanOrEqual(11); // 10 + ellipsis
    expect(out.endsWith("…")).toBe(true);
  });
});
