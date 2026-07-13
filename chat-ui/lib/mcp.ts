import { experimental_createMCPClient } from "ai";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { ServerKey } from "@/lib/agents";

/**
 * Maps each MCP server key to its Streamable HTTP endpoint (ending in /mcp).
 * Missing/empty entries are ignored so the chat still works if a server is not
 * configured.
 */
const SERVER_URLS: Record<ServerKey, string | undefined> = {
  "local-coder": process.env.MCP_LOCAL_CODER_URL,
  azlens: process.env.MCP_AZLENS_URL,
  "personal-assistant": process.env.MCP_PERSONAL_ASSISTANT_URL,
};

/**
 * Connect to the requested MCP servers (all of them by default), aggregate
 * their tools into a single tool set usable by the model, and return a
 * `close()` to tear down the connections once the response has finished
 * streaming. Pass `servers` to scope an agent to a subset of servers.
 */
export async function getMcpTools(servers?: ServerKey[]) {
  const keys =
    servers && servers.length > 0
      ? servers
      : (Object.keys(SERVER_URLS) as ServerKey[]);
  const urls = keys
    .map((key) => SERVER_URLS[key])
    .filter((url): url is string => Boolean(url && url.length > 0));

  type McpClient = Awaited<ReturnType<typeof experimental_createMCPClient>>;
  const clients: McpClient[] = [];
  for (const url of urls) {
    try {
      clients.push(
        await experimental_createMCPClient({
          transport: new StreamableHTTPClientTransport(new URL(url)),
        })
      );
    } catch (error) {
      // A missing/unreachable MCP server should not break the chat — the model
      // simply won't have that server's tools available.
      console.warn(`MCP: could not connect to ${url}:`, error);
    }
  }

  const toolSets = await Promise.all(clients.map((client) => client.tools()));

  // Tool names are unique across the three servers, so a shallow merge is safe.
  const tools = Object.assign({}, ...toolSets);

  async function close(): Promise<void> {
    await Promise.all(clients.map((client) => client.close().catch(() => {})));
  }

  return { tools, close };
}
