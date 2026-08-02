/**
 * Client-side session cost budget. A soft guardrail: sums the per-turn cost
 * shown in each answer's footer and warns as the session approaches / exceeds a
 * budget. Pure and unit-tested; the UI reads it to render a banner.
 */

export const SESSION_BUDGET_USD = Number(
  process.env.NEXT_PUBLIC_SESSION_BUDGET_USD ?? "1"
);

export type BudgetStatus = "ok" | "warn" | "over";

export function budgetStatus(
  totalUsd: number,
  budget = SESSION_BUDGET_USD
): BudgetStatus {
  if (!budget || budget <= 0) return "ok";
  if (totalUsd >= budget) return "over";
  if (totalUsd >= budget * 0.8) return "warn";
  return "ok";
}

export function formatUsd(n: number): string {
  return `$${n.toFixed(n < 0.01 ? 4 : 2)}`;
}
