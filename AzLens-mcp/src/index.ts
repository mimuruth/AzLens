#!/usr/bin/env node
/**
 * AzLens-mcp — stdio entry point
 * -----------------------------------------------------------------------------
 * Runs the MCP server over stdio for locally-spawned clients such as
 * Claude Desktop or VS Code. Tool logic lives in ./server.ts (createServer).
 * For HTTP hosting (Azure Container Apps) use ./http.ts instead.
 */

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createServer } from "./server.js";

async function main(): Promise<void> {
  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("AzLens-mcp running on stdio");
}

main().catch((error) => {
  console.error("Fatal error in AzLens-mcp:", error);
  process.exit(1);
});
