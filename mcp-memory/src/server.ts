import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

/**
 * mcp-memory — durable key/value memory so an agent can persist and recall
 * facts about the user across chats. Backed by a JSON file (MEMORY_FILE, or
 * ./data/memory.json). Tool logic is shared by the stdio and HTTP entry points.
 */

const FILE = process.env.MEMORY_FILE || "./data/memory.json";

type Store = Record<string, { value: string; updatedAt: string }>;

function load(): Store {
  try {
    if (existsSync(FILE))
      return JSON.parse(readFileSync(FILE, "utf8")) as Store;
  } catch {
    /* corrupt/missing → start empty */
  }
  return {};
}

function save(store: Store): void {
  const dir = dirname(FILE);
  if (dir && dir !== "." && !existsSync(dir))
    mkdirSync(dir, { recursive: true });
  writeFileSync(FILE, JSON.stringify(store, null, 2), "utf8");
}

function text(value: string) {
  return { content: [{ type: "text" as const, text: value }] };
}

export function createServer(): McpServer {
  const server = new McpServer({ name: "mcp-memory", version: "1.0.0" });

  server.registerTool(
    "remember",
    {
      title: "Remember a fact",
      description:
        "Store a durable fact under a short key (e.g. 'preferred_region'). " +
        "Overwrites any existing value for that key.",
      inputSchema: {
        key: z
          .string()
          .min(1)
          .max(128)
          .describe("Short identifier for the fact."),
        value: z.string().min(1).describe("The fact to remember."),
      },
    },
    async ({ key, value }) => {
      const store = load();
      store[key] = { value, updatedAt: new Date().toISOString() };
      save(store);
      return text(`Remembered "${key}".`);
    }
  );

  server.registerTool(
    "recall",
    {
      title: "Recall facts",
      description:
        "Retrieve a stored fact by key, or list all remembered facts when no " +
        "key is given.",
      inputSchema: {
        key: z
          .string()
          .optional()
          .describe("The key to recall; omit to list all."),
      },
    },
    async ({ key }) => {
      const store = load();
      if (key) {
        const entry = store[key];
        return text(
          entry ? `${key}: ${entry.value}` : `Nothing remembered for "${key}".`
        );
      }
      const keys = Object.keys(store);
      if (keys.length === 0) return text("No memories stored yet.");
      return text(keys.map((k) => `- ${k}: ${store[k].value}`).join("\n"));
    }
  );

  server.registerTool(
    "forget",
    {
      title: "Forget a fact",
      description: "Delete a stored fact by key.",
      inputSchema: {
        key: z.string().min(1).describe("The key to delete."),
      },
    },
    async ({ key }) => {
      const store = load();
      if (!(key in store)) return text(`Nothing to forget for "${key}".`);
      delete store[key];
      save(store);
      return text(`Forgot "${key}".`);
    }
  );

  server.registerResource(
    "memory",
    "memory://all",
    {
      title: "All memories",
      description: "The full set of remembered facts.",
      mimeType: "text/plain",
    },
    async (uri) => {
      const store = load();
      const keys = Object.keys(store);
      return {
        contents: [
          {
            uri: uri.href,
            mimeType: "text/plain",
            text:
              keys.length === 0
                ? "No memories stored yet."
                : keys.map((k) => `${k}: ${store[k].value}`).join("\n"),
          },
        ],
      };
    }
  );

  return server;
}
