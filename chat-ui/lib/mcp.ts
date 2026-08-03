import { experimental_createMCPClient, type ToolSet } from "ai";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { ServerKey } from "@/lib/agents";
import { isSensitiveTool } from "@/lib/tools";

/**
 * Maps each MCP server key to its Streamable HTTP endpoint (ending in /mcp).
 * Missing/empty entries are ignored so the chat still works if a server is not
 * configured.
 */
const SERVER_URLS: Record<ServerKey, string | undefined> = {
  "local-coder": process.env.MCP_LOCAL_CODER_URL,
  azlens: process.env.MCP_AZLENS_URL,
  "personal-assistant": process.env.MCP_PERSONAL_ASSISTANT_URL,
  github: process.env.MCP_GITHUB_URL,
  "azure-cost": process.env.MCP_AZURE_COST_URL,
  knowledge: process.env.MCP_KNOWLEDGE_URL,
  postgres: process.env.MCP_POSTGRES_URL,
  memory: process.env.MCP_MEMORY_URL,
};

/**
 * Connect to the requested MCP servers (all of them by default), aggregate
 * their tools into a single tool set usable by the model, and return a
 * `close()` to tear down the connections once the response has finished
 * streaming. Pass `servers` to scope an agent to a subset of servers.
 *
 * When `requireApproval` is set, mutating ("sensitive") tools have their
 * `execute` removed so the model's call for them pauses as a client-side tool
 * call — the UI then asks the user to approve before it runs (via /api/tool).
 */
export async function getMcpTools(
  servers?: ServerKey[],
  opts?: { requireApproval?: boolean }
) {
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
  const tools: ToolSet = Object.assign({}, ...toolSets);

  // Approval mode: drop `execute` from sensitive tools so the SDK surfaces the
  // call to the UI for confirmation instead of running it automatically.
  if (opts?.requireApproval) {
    for (const name of Object.keys(tools)) {
      if (isSensitiveTool(name) && tools[name]) {
        delete (tools[name] as { execute?: unknown }).execute;
      }
    }
  }

  async function close(): Promise<void> {
    await Promise.all(clients.map((client) => client.close().catch(() => {})));
  }

  return { tools, close };
}
