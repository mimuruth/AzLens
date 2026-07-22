import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { ServerKey } from "@/lib/agents";

/**
 * Raw MCP client helpers for the primitives the AI SDK wrapper doesn't expose:
 * prompts and resources. Used to power the in-app MCP library.
 */

const SERVER_URLS: Record<ServerKey, string | undefined> = {
  "local-coder": process.env.MCP_LOCAL_CODER_URL,
  azlens: process.env.MCP_AZLENS_URL,
  "personal-assistant": process.env.MCP_PERSONAL_ASSISTANT_URL,
  github: process.env.MCP_GITHUB_URL,
};

/**
 * Build a Streamable HTTP transport. Next.js patches the global `fetch` (adding
 * caching/dedup) which breaks the MCP session handshake, so we route requests
 * through an uncached fetch.
 */
function makeTransport(url: string): StreamableHTTPClientTransport {
  return new StreamableHTTPClientTransport(new URL(url), {
    fetch: (input, init) =>
      fetch(
        input as string | URL,
        {
          ...init,
          cache: "no-store",
        } as RequestInit
      ),
  });
}

export type LibraryPrompt = {
  server: ServerKey;
  name: string;
  title?: string;
  description?: string;
  arguments?: { name: string; description?: string; required?: boolean }[];
};

export type LibraryResource = {
  server: ServerKey;
  uri: string;
  name: string;
  title?: string;
  description?: string;
  mimeType?: string;
};

export type Library = {
  prompts: LibraryPrompt[];
  resources: LibraryResource[];
  errors?: string[];
};

async function withClient<T>(
  url: string,
  fn: (client: Client) => Promise<T>
): Promise<T | null> {
  const client = new Client({ name: "azlens-ui", version: "1.0.0" });
  try {
    await client.connect(makeTransport(url));
    return await fn(client);
  } catch {
    return null;
  } finally {
    await client.close().catch(() => {});
  }
}

function entries(): [ServerKey, string][] {
  return (Object.entries(SERVER_URLS) as [ServerKey, string | undefined][])
    .filter((e): e is [ServerKey, string] => Boolean(e[1]))
    .map((e) => [e[0], e[1]]);
}

/** List prompts and resources across every configured server. */
export async function getLibrary(): Promise<Library> {
  const prompts: LibraryPrompt[] = [];
  const resources: LibraryResource[] = [];
  const errors: string[] = [];

  for (const [server, url] of entries()) {
    const client = new Client({ name: "azlens-ui", version: "1.0.0" });
    try {
      await client.connect(makeTransport(url));
      const res = await client.listPrompts().catch(() => null);
      for (const p of res?.prompts ?? []) {
        prompts.push({
          server,
          name: p.name,
          title: p.title,
          description: p.description,
          arguments: p.arguments,
        });
      }
      const rres = await client.listResources().catch(() => null);
      for (const r of rres?.resources ?? []) {
        resources.push({
          server,
          uri: r.uri,
          name: r.name,
          title: r.title,
          description: r.description,
          mimeType: r.mimeType,
        });
      }
    } catch (e) {
      errors.push(`${server}: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      await client.close().catch(() => {});
    }
  }

  return { prompts, resources, errors };
}

/** Resolve a prompt template into its text (arguments substituted server-side). */
export async function getPromptText(
  server: ServerKey,
  name: string,
  args: Record<string, string>
): Promise<string> {
  const url = SERVER_URLS[server];
  if (!url) throw new Error(`Server ${server} is not configured.`);
  const text = await withClient(url, async (client) => {
    const res = await client.getPrompt({ name, arguments: args });
    return res.messages
      .map((m) => (m.content.type === "text" ? m.content.text : ""))
      .join("\n\n")
      .trim();
  });
  if (text == null) throw new Error(`Could not load prompt "${name}".`);
  return text;
}

/** Read a resource's text content. */
export async function readResourceText(
  server: ServerKey,
  uri: string
): Promise<string> {
  const url = SERVER_URLS[server];
  if (!url) throw new Error(`Server ${server} is not configured.`);
  const text = await withClient(url, async (client) => {
    const res = await client.readResource({ uri });
    return res.contents
      .map((c) => ("text" in c && typeof c.text === "string" ? c.text : ""))
      .join("\n")
      .trim();
  });
  if (text == null) throw new Error(`Could not read resource "${uri}".`);
  return text;
}
