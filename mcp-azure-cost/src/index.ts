#!/usr/bin/env node
/**
 * mcp-azure-cost — stdio entry point (Claude Desktop / VS Code).
 * For HTTP hosting (Azure Container Apps) use ./http.ts instead.
 */

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createServer } from "./server.js";

async function main(): Promise<void> {
  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(
    `mcp-azure-cost running on stdio (subscription: ${
      process.env.AZURE_SUBSCRIPTION_ID ? "set" : "not set"
    })`
  );
}

main().catch((error) => {
  console.error("Fatal error in mcp-azure-cost:", error);
  process.exit(1);
});
