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

const AZURE_SUBSCRIPTION_ID = process.env.AZURE_SUBSCRIPTION_ID ?? "";
const DEFAULT_WORKSPACE_ID = process.env.LOG_ANALYTICS_WORKSPACE_ID ?? "";

/**
 * A single credential instance is reused across all clients. DefaultAzureCredential
 * transparently chains Managed Identity, Azure CLI, environment variables, etc.
 */
const credential = new DefaultAzureCredential();

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
      const client = getLogsClient();
      const targetWorkspace = workspaceId || DEFAULT_WORKSPACE_ID;

      if (!targetWorkspace) {
        throw new Error(
          "No workspaceId provided and LOG_ANALYTICS_WORKSPACE_ID is not set."
        );
      }

      // Query the last 24 hours by default; adjust the timespan as needed.
      const result = await client.queryWorkspace(targetWorkspace, query, {
        duration: "P1D",
      });

      if (result.status !== LogsQueryResultStatus.Success) {
        throw new Error(
          `KQL query did not succeed (status: ${result.status}).`
        );
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
        "Search internal wiki / documentation for a query and return matching " +
        "entries. Replace the stub body with your wiki backend (Azure DevOps " +
        "Wiki, Git repo, Confluence, etc.).",
      inputSchema: {
        query: z.string().min(1).describe("The text to search the wiki for."),
      },
    },
    async ({ query }) => {
      // TODO: Wire this to your documentation source. Common options:
      //   - Azure DevOps Wiki REST API
      //   - A local Git repository of markdown files
      //   - Azure AI Search index over your docs
      const placeholder = [
        `Wiki search stub — received query: "${query}".`,
        "Implement search_wiki against your documentation backend.",
      ].join("\n");

      return {
        content: [{ type: "text", text: placeholder }],
      };
    }
  );

  return server;
}
