#!/usr/bin/env node
/**
 * mcp-github — stdio entry point (Claude Desktop / VS Code).
 * For HTTP hosting (Azure Container Apps) use ./http.ts instead.
 */

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createServer } from "./server.js";

async function main(): Promise<void> {
  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(
    `mcp-github running on stdio (${process.env.GITHUB_TOKEN ? "authenticated" : "anonymous"})`
  );
}

main().catch((error) => {
  console.error("Fatal error in mcp-github:", error);
  process.exit(1);
});
