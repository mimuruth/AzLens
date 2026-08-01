import { describe, it, expect } from "vitest";
import { evaluateRouter, formatReport } from "../eval/router-eval";

// Regression gate for the complexity router. The floors are set below current
// accuracy so intentional dataset growth surfaces regressions without flapping.
const ACCURACY_FLOOR = 0.85;
const RECALL_FLOOR = 0.8; // don't silently start routing complex work to the cheap model
const PRECISION_FLOOR = 0.8; // don't waste the expensive model on simple prompts

describe("router eval harness", () => {
  const report = evaluateRouter();

  it("prints a report", () => {
    // eslint-disable-next-line no-console
    console.log("\n" + formatReport(report) + "\n");
    expect(report.total).toBeGreaterThan(20);
  });

  it("meets the accuracy floor", () => {
    expect(report.accuracy).toBeGreaterThanOrEqual(ACCURACY_FLOOR);
  });

  it("does not under-route complex prompts (recall)", () => {
    expect(report.recall).toBeGreaterThanOrEqual(RECALL_FLOOR);
  });

  it("does not over-route simple prompts (precision)", () => {
    expect(report.precision).toBeGreaterThanOrEqual(PRECISION_FLOOR);
  });

  it("has no unexpected misroutes (only cases flagged `hard`)", () => {
    const unexpected = report.failures.filter((f) => !f.hard);
    expect(unexpected, formatReport(report)).toEqual([]);
  });
});
