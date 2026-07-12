#!/usr/bin/env node
/**
 * mcp-local-coder — stdio entry point
 * -----------------------------------------------------------------------------
 * Runs the MCP server over stdio for locally-spawned clients such as
 * Claude Desktop or VS Code. Tool logic lives in ./server.ts (createServer).
 * For HTTP hosting (Azure Container Apps) use ./http.ts instead.
 */

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createServer, WORKSPACE_ROOT } from "./server.js";

async function main(): Promise<void> {
  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // Never log to stdout — it is reserved for the MCP protocol. Use stderr.
  console.error(
    `mcp-local-coder running on stdio (workspace root: ${WORKSPACE_ROOT})`
  );
}

main().catch((error) => {
  console.error("Fatal error in mcp-local-coder:", error);
  process.exit(1);
});
