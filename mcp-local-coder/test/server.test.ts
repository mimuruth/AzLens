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
  process.env.WORKSPACE_ROOT = mkdtempSync(path.join(tmpdir(), "coder-test-"));
  ({ createServer } = await import("../src/server"));
});

describe("mcp-local-coder", () => {
  it("exposes its tools", async () => {
    const client = await connect();
    const names = (await client.listTools()).tools.map((t) => t.name);
    expect(names).toEqual(
      expect.arrayContaining(["read_file", "write_file", "search_code"])
    );
  });

  it("writes and reads a file", async () => {
    const client = await connect();
    await client.callTool({
      name: "write_file",
      arguments: { path: "hello.txt", content: "hello vitest" },
    });
    const read = (await client.callTool({
      name: "read_file",
      arguments: { path: "hello.txt" },
    })) as ToolResult;
    expect(textOf(read)).toContain("hello vitest");
  });

  it("rejects paths outside the workspace", async () => {
    const client = await connect();
    const res = (await client.callTool({
      name: "read_file",
      arguments: { path: "../../etc/passwd" },
    })) as ToolResult & { isError?: boolean };
    expect(res.isError).toBe(true);
  });
});
