#!/usr/bin/env node
/**
 * mcp-personal-assistant — stdio entry point
 * -----------------------------------------------------------------------------
 * Runs the MCP server over stdio for locally-spawned clients such as
 * Claude Desktop or VS Code. Tool logic lives in ./server.ts (createServer).
 * For HTTP hosting (Azure Container Apps) use ./http.ts instead.
 */

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createServer, NOTES_ROOT } from "./server.js";

async function main(): Promise<void> {
  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(
    `mcp-personal-assistant running on stdio (notes root: ${NOTES_ROOT})`
  );
}

main().catch((error) => {
  console.error("Fatal error in mcp-personal-assistant:", error);
  process.exit(1);
});
