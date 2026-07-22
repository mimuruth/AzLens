/**
 * AzLens-mcp — server factory
 * -----------------------------------------------------------------------------
 * Builds and configures the McpServer instance and registers all Azure tools.
 * Both the stdio entry point (index.ts) and the HTTP entry point (http.ts)
 * import `createServer()` so the tool logic lives in exactly one place.
 *
 * Authentication uses `DefaultAzureCredential`: `az login` locally, Managed
 * Identity in Azure Container Apps. No secrets are hardcoded.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { DefaultAzureCredential } from "@azure/identity";
import { ResourceManagementClient } from "@azure/arm-resources";
import { LogsQueryClient, LogsQueryResultStatus } from "@azure/monitor-query";
import { getWikiSources, type WikiResult } from "./wiki.js";

const AZURE_SUBSCRIPTION_ID = process.env.AZURE_SUBSCRIPTION_ID ?? "";
const DEFAULT_WORKSPACE_ID = process.env.LOG_ANALYTICS_WORKSPACE_ID ?? "";

/**
 * A single credential instance is reused across all clients. DefaultAzureCredential
 * transparently chains Managed Identity, Azure CLI, environment variables, etc.
 */
const credential = new DefaultAzureCredential();

/**
 * Verify the server can authenticate to Azure before calling a live API, so
 * tools can return a clear hint instead of a raw SDK error.
 * Returns a human-readable message when NOT ready, or null when good to go.
 */
async function checkAzureAuth(scope: string): Promise<string | null> {
  if (!AZURE_SUBSCRIPTION_ID) {
    return (
      "Azure is not configured: set AZURE_SUBSCRIPTION_ID (the subscription to " +
      "query) in the environment."
    );
  }
  try {
    const token = await credential.getToken(scope);
    if (!token) {
      return (
        "Not authenticated to Azure. Run `az login` locally, or assign a " +
        "managed identity when hosted on Azure Container Apps."
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

/** Lazily constructed clients so the server can start before `az login`. */
let resourceClient: ResourceManagementClient | undefined;
let logsClient: LogsQueryClient | undefined;

function getResourceClient(): ResourceManagementClient {
  if (!AZURE_SUBSCRIPTION_ID) {
    throw new Error(
      "AZURE_SUBSCRIPTION_ID is not set. Configure it in the environment (.env)."
    );
  }
  if (!resourceClient) {
    resourceClient = new ResourceManagementClient(
      credential,
      AZURE_SUBSCRIPTION_ID
    );
  }
  return resourceClient;
}

function getLogsClient(): LogsQueryClient {
  if (!logsClient) {
    logsClient = new LogsQueryClient(credential);
  }
  return logsClient;
}

/** Create a fully configured AzLens-mcp server instance. */
export function createServer(): McpServer {
  const server = new McpServer({
    name: "AzLens-mcp",
    version: "1.0.0",
  });

  // -------------------------------------------------------------------------
  // Tool: query_azure_resource
  // -------------------------------------------------------------------------
  server.registerTool(
    "query_azure_resource",
    {
      title: "Query Azure Resource",
      description:
        "Fetch the ARM representation of an Azure resource by its full resource ID.",
      inputSchema: {
        resourceId: z
          .string()
          .min(1)
          .describe(
            "Full ARM resource ID, e.g. " +
              "/subscriptions/<sub>/resourceGroups/<rg>/providers/<provider>/<type>/<name>"
          ),
      },
    },
    async ({ resourceId }) => {
      const authError = await checkAzureAuth(
        "https://management.azure.com/.default"
      );
      if (authError) {
        return { content: [{ type: "text", text: authError }], isError: true };
      }

      const client = getResourceClient();

      // The ARM API requires an explicit API version per resource type. In a
      // real implementation, resolve this from the provider or accept a param.
      const apiVersion = "2022-09-01";

      const resource = await client.resources.getById(resourceId, apiVersion);

      return {
        content: [{ type: "text", text: JSON.stringify(resource, null, 2) }],
      };
    }
  );

  // -------------------------------------------------------------------------
  // Tool: run_kql_query
  // -------------------------------------------------------------------------
  server.registerTool(
    "run_kql_query",
    {
      title: "Run KQL Query",
      description:
        "Execute a Kusto (KQL) query against a Log Analytics workspace and " +
        "return the resulting rows.",
      inputSchema: {
        workspaceId: z
          .string()
          .min(1)
          .describe(
            "Log Analytics workspace (customer) ID. Falls back to " +
              "LOG_ANALYTICS_WORKSPACE_ID if left blank."
          )
          .optional(),
        query: z.string().min(1).describe("The KQL query to execute."),
      },
    },
    async ({ workspaceId, query }) => {
      const targetWorkspace = workspaceId || DEFAULT_WORKSPACE_ID;

      if (!targetWorkspace) {
        return {
          content: [
            {
              type: "text",
              text: "No workspaceId provided and LOG_ANALYTICS_WORKSPACE_ID is not set.",
            },
          ],
          isError: true,
        };
      }

      const authError = await checkAzureAuth(
        "https://api.loganalytics.io/.default"
      );
      if (authError) {
        return { content: [{ type: "text", text: authError }], isError: true };
      }

      const client = getLogsClient();

      // Query the last 24 hours by default; adjust the timespan as needed.
      const result = await client.queryWorkspace(targetWorkspace, query, {
        duration: "P1D",
      });

      if (result.status !== LogsQueryResultStatus.Success) {
        return {
          content: [
            {
              type: "text",
              text: `KQL query did not succeed (status: ${result.status}).`,
            },
          ],
          isError: true,
        };
      }

      return {
        content: [
          { type: "text", text: JSON.stringify(result.tables, null, 2) },
        ],
      };
    }
  );

  // -------------------------------------------------------------------------
  // Tool: search_wiki
  // -------------------------------------------------------------------------
  server.registerTool(
    "search_wiki",
    {
      title: "Search Wiki",
      description:
        "Search documentation for a query. Backed by Microsoft Learn by default; " +
        "additional internal wikis (e.g. Azure DevOps) can be enabled via config.",
      inputSchema: {
        query: z.string().min(1).describe("The text to search the wiki for."),
      },
    },
    async ({ query }) => {
      const sources = getWikiSources();
      const settled = await Promise.allSettled(
        sources.map((s) => s.search(query, 6))
      );

      const results = [] as WikiResult[];
      const errors: string[] = [];
      settled.forEach((r, i) => {
        if (r.status === "fulfilled") results.push(...r.value);
        else
          errors.push(
            `${sources[i].name}: ${
              r.reason instanceof Error ? r.reason.message : String(r.reason)
            }`
          );
      });

      if (results.length === 0) {
        const text = errors.length
          ? `No results for "${query}". Source errors:\n${errors.join("\n")}`
          : `No wiki results found for "${query}".`;
        return {
          content: [{ type: "text", text }],
          isError: errors.length > 0,
        };
      }

      const body = results
        .map(
          (r) =>
            `- ${r.title} [${r.source}]\n  ${r.url}${
              r.snippet ? `\n  ${r.snippet}` : ""
            }`
        )
        .join("\n\n");
      const footer = errors.length
        ? `\n\n(Some sources failed: ${errors.join("; ")})`
        : "";

      return { content: [{ type: "text", text: body + footer }] };
    }
  );

  // -------------------------------------------------------------------------
  // Resource: current Azure context (subscription + workspace)
  // -------------------------------------------------------------------------
  server.registerResource(
    "azure-context",
    "azlens://context",
    {
      title: "Azure Context",
      description:
        "The subscription and Log Analytics workspace AzLens is configured for.",
      mimeType: "text/plain",
    },
    async (uri) => {
      const text = [
        `Subscription: ${AZURE_SUBSCRIPTION_ID || "(not set)"}`,
        `Default Log Analytics workspace: ${DEFAULT_WORKSPACE_ID || "(not set)"}`,
        "Auth: DefaultAzureCredential (az login locally, Managed Identity in Azure).",
      ].join("\n");
      return {
        contents: [{ uri: uri.href, mimeType: "text/plain", text }],
      };
    }
  );

  // -------------------------------------------------------------------------
  // Prompts: reusable Azure workflows
  // -------------------------------------------------------------------------
  server.registerPrompt(
    "diagnose-resource",
    {
      title: "Diagnose a resource",
      description: "Investigate the health and config of an Azure resource.",
      argsSchema: {
        resourceId: z.string().describe("Full ARM resource ID to diagnose."),
      },
    },
    ({ resourceId }) => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: `Use query_azure_resource on \`${resourceId}\` to inspect its configuration, then summarise potential issues and next steps. If relevant, suggest a KQL query to check its recent logs.`,
          },
        },
      ],
    })
  );

  server.registerPrompt(
    "write-kql",
    {
      title: "Write a KQL query",
      description: "Draft a Log Analytics KQL query for a goal.",
      argsSchema: {
        goal: z.string().describe("What you want the query to find."),
      },
    },
    ({ goal }) => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: `Write a KQL query for Azure Log Analytics that accomplishes: "${goal}". Explain each clause, then offer to run it with run_kql_query.`,
          },
        },
      ],
    })
  );

  return server;
}
