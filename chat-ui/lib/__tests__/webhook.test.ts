import { describe, it, expect } from "vitest";
import { formatRunMessage, webhookPayload } from "../webhook";

describe("formatRunMessage", () => {
  it("includes the objective, step count, and answer", () => {
    const m = formatRunMessage("Weekly report", "All good.", 3);
    expect(m).toContain("Weekly report");
    expect(m).toContain("3 steps");
    expect(m).toContain("All good.");
  });

  it("uses singular for one step", () => {
    expect(formatRunMessage("x", "y", 1)).toContain("1 step)");
  });

  it("truncates very long answers", () => {
    const m = formatRunMessage("x", "z".repeat(5000), 1);
    expect(m.endsWith("…")).toBe(true);
    expect(m.length).toBeLessThan(3700);
  });
});

describe("webhookPayload", () => {
  it("wraps the message as { text } for Slack/Teams", () => {
    expect(webhookPayload("hi")).toEqual({ text: "hi" });
  });
});
