#!/usr/bin/env node
/**
 * mcp-knowledge — stdio entry point (Claude Desktop / VS Code).
 * For HTTP hosting (Azure Container Apps) use ./http.ts instead.
 */

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createServer } from "./server.js";

async function main(): Promise<void> {
  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(
    `mcp-knowledge running on stdio (index: ${
      process.env.AZURE_SEARCH_INDEX ? "set" : "not set"
    })`
  );
}

main().catch((error) => {
  console.error("Fatal error in mcp-knowledge:", error);
  process.exit(1);
});
