/**
 * mcp-azure-cost — server factory
 * -----------------------------------------------------------------------------
 * Exposes Azure spend analytics via the Cost Management REST API: actual cost
 * (optionally grouped), a spend forecast, and budgets. Authentication uses
 * `DefaultAzureCredential` (az login locally, Managed Identity in Azure) — no
 * secrets are hardcoded. Tool logic lives here and is shared by the stdio
 * (index.ts) and HTTP (http.ts) entry points.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { DefaultAzureCredential } from "@azure/identity";

const ARM = "https://management.azure.com";
const ARM_SCOPE = "https://management.azure.com/.default";
const AZURE_SUBSCRIPTION_ID = process.env.AZURE_SUBSCRIPTION_ID ?? "";

const credential = new DefaultAzureCredential();

/**
 * Verify the server can authenticate to Azure before calling a live API, so
 * tools return a clear hint instead of a raw error. Returns a message when NOT
 * ready, or null when good to go.
 */
async function checkAzureAuth(): Promise<string | null> {
  if (!AZURE_SUBSCRIPTION_ID) {
    return (
      "Azure is not configured: set AZURE_SUBSCRIPTION_ID (the subscription to " +
      "analyze) in the environment."
    );
  }
  try {
    const token = await credential.getToken(ARM_SCOPE);
    if (!token) {
      return (
        "Not authenticated to Azure. Run `az login` locally, or assign a " +
        "managed identity when hosted on Azure Container Apps. The identity " +
        "needs the Cost Management Reader role on the subscription."
      );
    }
    return null;
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    return (
      "Not authenticated to Azure. Run `az login` locally (or assign a managed " +
      `identity in Azure), then retry.\n\nDetails: ${detail}`
    );
  }
}

/** Perform an ARM REST request with a bearer token (throws on error). */
async function arm<T = unknown>(
  method: "GET" | "POST",
  path: string,
  apiVersion: string,
  body?: unknown
): Promise<T> {
  const token = await credential.getToken(ARM_SCOPE);
  if (!token) throw new Error("Could not acquire an Azure access token.");
  const sep = path.includes("?") ? "&" : "?";
  const url = `${ARM}${path}${sep}api-version=${apiVersion}`;
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token.token}`,
    Accept: "application/json",
  };
  const init: RequestInit = { method, headers };
  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
    init.body = JSON.stringify(body);
  }
  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(30000) });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    let message = `Azure API ${res.status} ${res.statusText}`;
    try {
      const parsed = JSON.parse(text) as { error?: { message?: string } };
      if (parsed.error?.message) message += `: ${parsed.error.message}`;
    } catch {
      /* non-JSON error body */
    }
    if (res.status === 403) {
      message +=
        " (the identity needs the Cost Management Reader role on the subscription).";
    }
    throw new Error(message);
  }
  return (await res.json()) as T;
}

function text(value: string) {
  return { content: [{ type: "text" as const, text: value }] };
}

const money = (n: number, currency: string) =>
  `${currency} ${n.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

type QueryResult = {
  properties: {
    columns: { name: string; type: string }[];
    rows: (string | number)[][];
  };
};

/** Find a column index by name (case-insensitive), or -1. */
function colIndex(cols: { name: string }[], name: string): number {
  return cols.findIndex((c) => c.name.toLowerCase() === name.toLowerCase());
}

/** Build the CostManagement query/forecast time scope from tool args. */
function buildTimeframe(
  timeframe: string,
  from?: string,
  to?: string
): Record<string, unknown> {
  if (from && to) {
    return { timeframe: "Custom", timePeriod: { from, to } };
  }
  return { timeframe };
}

const TIMEFRAMES = [
  "MonthToDate",
  "BillingMonthToDate",
  "TheLastMonth",
  "TheLastBillingMonth",
  "WeekToDate",
] as const;

const GROUP_DIMENSIONS = [
  "ServiceName",
  "ResourceGroupName",
  "ResourceLocation",
  "MeterCategory",
  "ResourceType",
] as const;

/** Create a fully configured mcp-azure-cost server instance. */
export function createServer(): McpServer {
  const server = new McpServer({ name: "mcp-azure-cost", version: "1.0.0" });

  // ------------------------------------------------------------------------
  // Tool: query_cost — actual spend, optionally grouped by a dimension.
  // ------------------------------------------------------------------------
  server.registerTool(
    "query_cost",
    {
      title: "Query Azure Cost",
      description:
        "Get actual Azure spend for the subscription over a timeframe, " +
        "optionally broken down by a dimension (service, resource group, etc.).",
      inputSchema: {
        timeframe: z
          .enum(TIMEFRAMES)
          .default("MonthToDate")
          .describe("Preset period. Ignored when 'from'/'to' are provided."),
        groupBy: z
          .enum(GROUP_DIMENSIONS)
          .optional()
          .describe("Dimension to break the total down by."),
        from: z
          .string()
          .optional()
          .describe("Custom period start (ISO 8601, e.g. 2026-06-01)."),
        to: z
          .string()
          .optional()
          .describe("Custom period end (ISO 8601, e.g. 2026-06-30)."),
        limit: z.number().int().min(1).max(25).default(10).optional(),
      },
    },
    async ({ timeframe, groupBy, from, to, limit }) => {
      const notReady = await checkAzureAuth();
      if (notReady) return text(notReady);

      const dataset: Record<string, unknown> = {
        granularity: "None",
        aggregation: { totalCost: { name: "Cost", function: "Sum" } },
      };
      if (groupBy) {
        dataset.grouping = [{ type: "Dimension", name: groupBy }];
      }
      const requestBody = {
        type: "ActualCost",
        ...buildTimeframe(timeframe, from, to),
        dataset,
      };

      const result = await arm<QueryResult>(
        "POST",
        `/subscriptions/${AZURE_SUBSCRIPTION_ID}/providers/Microsoft.CostManagement/query`,
        "2023-11-01",
        requestBody
      );

      const cols = result.properties.columns;
      const rows = result.properties.rows;
      const costIdx = colIndex(cols, "Cost");
      const currencyIdx = colIndex(cols, "Currency");
      const groupIdx = groupBy ? colIndex(cols, groupBy) : -1;
      const currency =
        currencyIdx >= 0 && rows[0] ? String(rows[0][currencyIdx]) : "USD";
      const period = from && to ? `${from} → ${to}` : timeframe;

      if (rows.length === 0) {
        return text(`No cost data for ${period}.`);
      }

      const total = rows.reduce(
        (sum, r) => sum + (costIdx >= 0 ? Number(r[costIdx]) || 0 : 0),
        0
      );

      if (!groupBy) {
        return text(`Total Azure cost (${period}): ${money(total, currency)}`);
      }

      const breakdown = rows
        .map((r) => ({
          name: groupIdx >= 0 ? String(r[groupIdx]) : "(unknown)",
          cost: costIdx >= 0 ? Number(r[costIdx]) || 0 : 0,
        }))
        .sort((a, b) => b.cost - a.cost)
        .slice(0, limit ?? 10);

      const lines = breakdown.map(
        (b) =>
          `- ${b.name}: ${money(b.cost, currency)} (${((b.cost / total) * 100).toFixed(1)}%)`
      );
      return text(
        `Azure cost by ${groupBy} (${period}) — total ${money(total, currency)}:\n\n${lines.join("\n")}`
      );
    }
  );

  // ------------------------------------------------------------------------
  // Tool: get_cost_forecast — projected spend for a timeframe.
  // ------------------------------------------------------------------------
  server.registerTool(
    "get_cost_forecast",
    {
      title: "Forecast Azure Cost",
      description:
        "Forecast Azure spend for the subscription over a timeframe using " +
        "Cost Management's forecast model.",
      inputSchema: {
        timeframe: z
          .enum(TIMEFRAMES)
          .default("MonthToDate")
          .describe("Preset period. Ignored when 'from'/'to' are provided."),
        from: z.string().optional().describe("Custom period start (ISO 8601)."),
        to: z.string().optional().describe("Custom period end (ISO 8601)."),
      },
    },
    async ({ timeframe, from, to }) => {
      const notReady = await checkAzureAuth();
      if (notReady) return text(notReady);

      const requestBody = {
        type: "ActualCost",
        ...buildTimeframe(timeframe, from, to),
        includeActualCost: true,
        includeFreshPartialCost: false,
        dataset: {
          granularity: "None",
          aggregation: { totalCost: { name: "Cost", function: "Sum" } },
        },
      };

      const result = await arm<QueryResult>(
        "POST",
        `/subscriptions/${AZURE_SUBSCRIPTION_ID}/providers/Microsoft.CostManagement/forecast`,
        "2023-11-01",
        requestBody
      );

      const cols = result.properties.columns;
      const rows = result.properties.rows;
      const costIdx = colIndex(cols, "Cost");
      const currencyIdx = colIndex(cols, "Currency");
      const currency =
        currencyIdx >= 0 && rows[0] ? String(rows[0][currencyIdx]) : "USD";
      const period = from && to ? `${from} → ${to}` : timeframe;

      if (rows.length === 0) return text(`No forecast data for ${period}.`);
      const total = rows.reduce(
        (sum, r) => sum + (costIdx >= 0 ? Number(r[costIdx]) || 0 : 0),
        0
      );
      return text(`Forecast Azure cost (${period}): ${money(total, currency)}`);
    }
  );

  // ------------------------------------------------------------------------
  // Tool: list_budgets — configured budgets and current spend vs limit.
  // ------------------------------------------------------------------------
  server.registerTool(
    "list_budgets",
    {
      title: "List Azure Budgets",
      description:
        "List Cost Management budgets on the subscription with their limit, " +
        "period, and current spend.",
      inputSchema: {},
    },
    async () => {
      const notReady = await checkAzureAuth();
      if (notReady) return text(notReady);

      const data = await arm<{
        value: {
          name: string;
          properties: {
            amount: number;
            timeGrain: string;
            currentSpend?: { amount: number; unit: string };
          };
        }[];
      }>(
        "GET",
        `/subscriptions/${AZURE_SUBSCRIPTION_ID}/providers/Microsoft.Consumption/budgets`,
        "2023-05-01"
      );

      if (!data.value || data.value.length === 0) {
        return text("No budgets are configured on this subscription.");
      }

      const lines = data.value.map((b) => {
        const unit = b.properties.currentSpend?.unit ?? "USD";
        const spent = b.properties.currentSpend?.amount ?? 0;
        const limit = b.properties.amount;
        const pct = limit > 0 ? ((spent / limit) * 100).toFixed(1) : "0.0";
        return (
          `- ${b.name} [${b.properties.timeGrain}]: ` +
          `${money(spent, unit)} / ${money(limit, unit)} (${pct}%)`
        );
      });
      return text(`Budgets:\n\n${lines.join("\n")}`);
    }
  );

  // ------------------------------------------------------------------------
  // Resource: subscription context
  // ------------------------------------------------------------------------
  server.registerResource(
    "context",
    "azurecost://context",
    {
      title: "Azure Cost Context",
      description: "The subscription and auth status this server operates on.",
      mimeType: "text/plain",
    },
    async (uri) => {
      const notReady = await checkAzureAuth();
      return {
        contents: [
          {
            uri: uri.href,
            mimeType: "text/plain",
            text:
              `Subscription: ${AZURE_SUBSCRIPTION_ID || "(not set)"}\n` +
              `Auth: ${notReady ? "not ready" : "ready"}\n` +
              (notReady ? `Hint: ${notReady}` : "Ready to query cost data."),
          },
        ],
      };
    }
  );

  // ------------------------------------------------------------------------
  // Prompt: cost review
  // ------------------------------------------------------------------------
  server.registerPrompt(
    "cost-review",
    {
      title: "Review this month's spend",
      description: "Summarise spend, top cost drivers, and savings ideas.",
      argsSchema: {},
    },
    () => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: "Use query_cost (groupBy ServiceName, timeframe MonthToDate) and get_cost_forecast to summarise this month's Azure spend. Call out the top 3 cost drivers, compare against list_budgets, and suggest concrete savings.",
          },
        },
      ],
    })
  );

  return server;
}
