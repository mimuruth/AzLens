import { describe, it, expect, beforeAll } from "vitest";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

type ToolResult = { content?: { type: string; text?: string }[] };
let createServer: () => import("@modelcontextprotocol/sdk/server/mcp.js").McpServer;

async function connect(): Promise<Client> {
  const server = createServer();
  const [clientT, serverT] = InMemoryTransport.createLinkedPair();
  await server.connect(serverT);
  const client = new Client(
    { name: "test", version: "1.0.0" },
    { capabilities: {} }
  );
  await client.connect(clientT);
  return client;
}

function textOf(res: ToolResult): string {
  return (res.content ?? [])
    .filter((c) => c.type === "text")
    .map((c) => c.text ?? "")
    .join("\n");
}

beforeAll(async () => {
  process.env.NOTES_ROOT = mkdtempSync(path.join(tmpdir(), "pa-test-"));
  ({ createServer } = await import("../src/server"));
});

describe("mcp-personal-assistant", () => {
  it("exposes its tools", async () => {
    const client = await connect();
    const names = (await client.listTools()).tools.map((t) => t.name);
    expect(names).toContain("get_daily_notes");
    expect(names).toContain("update_todo_list");
  });

  it("updates the to-do list", async () => {
    const client = await connect();
    const res = (await client.callTool({
      name: "update_todo_list",
      arguments: { task: "write tests", status: "done" },
    })) as ToolResult;
    expect(textOf(res)).toContain("done");
  });

  it("returns a placeholder for a date with no notes", async () => {
    const client = await connect();
    const res = (await client.callTool({
      name: "get_daily_notes",
      arguments: { date: "2025-01-01" },
    })) as ToolResult;
    expect(textOf(res).length).toBeGreaterThan(0);
  });
});
