import { describe, it, expect } from "vitest";
import { budgetStatus, formatUsd } from "../budget";

describe("budgetStatus", () => {
  it("is ok below 80% of budget", () => {
    expect(budgetStatus(0.5, 1)).toBe("ok");
    expect(budgetStatus(0, 1)).toBe("ok");
  });

  it("warns from 80% up to the budget", () => {
    expect(budgetStatus(0.8, 1)).toBe("warn");
    expect(budgetStatus(0.95, 1)).toBe("warn");
  });

  it("is over at or above the budget", () => {
    expect(budgetStatus(1, 1)).toBe("over");
    expect(budgetStatus(2.5, 1)).toBe("over");
  });

  it("treats a non-positive budget as disabled", () => {
    expect(budgetStatus(5, 0)).toBe("ok");
  });
});

describe("formatUsd", () => {
  it("uses more precision for tiny amounts", () => {
    expect(formatUsd(0.0034)).toBe("$0.0034");
    expect(formatUsd(1.5)).toBe("$1.50");
  });
});
