import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

/**
 * mcp-memory — durable key/value memory so an agent can persist and recall
 * facts about the user across chats. Uses Azure Cosmos DB when COSMOS_ENDPOINT
 * is set (AAD / managed identity), otherwise a local JSON file (MEMORY_FILE).
 * Tool logic is shared by the stdio and HTTP entry points.
 */

type Entry = { value: string; updatedAt: string };

interface Store {
  get(key: string): Promise<string | null>;
  all(): Promise<Record<string, string>>;
  set(key: string, value: string): Promise<void>;
  del(key: string): Promise<boolean>;
}

// ---- File backend (default) ------------------------------------------------
class FileStore implements Store {
  constructor(private file: string) {}
  private load(): Record<string, Entry> {
    try {
      if (existsSync(this.file))
        return JSON.parse(readFileSync(this.file, "utf8"));
    } catch {
      /* corrupt/missing → empty */
    }
    return {};
  }
  private save(data: Record<string, Entry>): void {
    const dir = dirname(this.file);
    if (dir && dir !== "." && !existsSync(dir))
      mkdirSync(dir, { recursive: true });
    writeFileSync(this.file, JSON.stringify(data, null, 2), "utf8");
  }
  async get(key: string) {
    return this.load()[key]?.value ?? null;
  }
  async all() {
    const d = this.load();
    return Object.fromEntries(Object.keys(d).map((k) => [k, d[k].value]));
  }
  async set(key: string, value: string) {
    const d = this.load();
    d[key] = { value, updatedAt: new Date().toISOString() };
    this.save(d);
  }
  async del(key: string) {
    const d = this.load();
    if (!(key in d)) return false;
    delete d[key];
    this.save(d);
    return true;
  }
}

// ---- Cosmos backend (when COSMOS_ENDPOINT is set) --------------------------
type CosmosDoc = {
  id: string;
  userId: string;
  value: string;
  updatedAt: string;
};

class CosmosStore implements Store {
  private container: import("@azure/cosmos").Container | undefined;
  private ready: Promise<void>;
  constructor(
    private endpoint: string,
    private userId: string,
    private db: string,
    private containerName: string
  ) {
    this.ready = this.init();
  }
  private async init() {
    const { CosmosClient } = await import("@azure/cosmos");
    const { DefaultAzureCredential } = await import("@azure/identity");
    const client = new CosmosClient({
      endpoint: this.endpoint,
      aadCredentials: new DefaultAzureCredential(),
    });
    this.container = client.database(this.db).container(this.containerName);
  }
  async get(key: string) {
    await this.ready;
    try {
      const { resource } = await this.container!.item(
        key,
        this.userId
      ).read<CosmosDoc>();
      return resource?.value ?? null;
    } catch {
      return null;
    }
  }
  async all() {
    await this.ready;
    const { resources } = await this.container!.items.query<CosmosDoc>({
      query: "SELECT c.id, c.value FROM c WHERE c.userId = @u",
      parameters: [{ name: "@u", value: this.userId }],
    }).fetchAll();
    return Object.fromEntries(resources.map((r) => [r.id, r.value]));
  }
  async set(key: string, value: string) {
    await this.ready;
    const doc: CosmosDoc = {
      id: key,
      userId: this.userId,
      value,
      updatedAt: new Date().toISOString(),
    };
    await this.container!.items.upsert(doc);
  }
  async del(key: string) {
    await this.ready;
    try {
      await this.container!.item(key, this.userId).delete();
      return true;
    } catch {
      return false;
    }
  }
}

function makeStore(): Store {
  if (process.env.COSMOS_ENDPOINT) {
    return new CosmosStore(
      process.env.COSMOS_ENDPOINT,
      process.env.MEMORY_USER_ID || "shared",
      process.env.COSMOS_DATABASE || "azlens",
      process.env.COSMOS_MEMORY_CONTAINER || "memory"
    );
  }
  return new FileStore(process.env.MEMORY_FILE || "./data/memory.json");
}

function text(value: string) {
  return { content: [{ type: "text" as const, text: value }] };
}

export function createServer(): McpServer {
  const server = new McpServer({ name: "mcp-memory", version: "1.0.0" });
  const store = makeStore();

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
      await store.set(key, value);
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
      if (key) {
        const value = await store.get(key);
        return text(
          value ? `${key}: ${value}` : `Nothing remembered for "${key}".`
        );
      }
      const all = await store.all();
      const keys = Object.keys(all);
      if (keys.length === 0) return text("No memories stored yet.");
      return text(keys.map((k) => `- ${k}: ${all[k]}`).join("\n"));
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
      const ok = await store.del(key);
      return text(ok ? `Forgot "${key}".` : `Nothing to forget for "${key}".`);
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
      const all = await store.all();
      const keys = Object.keys(all);
      return {
        contents: [
          {
            uri: uri.href,
            mimeType: "text/plain",
            text:
              keys.length === 0
                ? "No memories stored yet."
                : keys.map((k) => `${k}: ${all[k]}`).join("\n"),
          },
        ],
      };
    }
  );

  return server;
}
