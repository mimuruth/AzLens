import { experimental_createMCPClient } from "ai";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

/**
 * URLs of the MCP servers to aggregate. Each must be the Streamable HTTP
 * endpoint (ending in /mcp). Missing/empty entries are ignored so the chat
 * still works if a server is not configured.
 */
const SERVER_URLS = [
  process.env.MCP_LOCAL_CODER_URL,
  process.env.MCP_AZLENS_URL,
  process.env.MCP_PERSONAL_ASSISTANT_URL,
].filter((url): url is string => Boolean(url && url.length > 0));

/**
 * Connect to every configured MCP server, aggregate their tools into a single
 * tool set usable by the model, and return a `close()` to tear down the
 * connections once the response has finished streaming.
 */
export async function getMcpTools() {
  const clients = await Promise.all(
    SERVER_URLS.map((url) =>
      experimental_createMCPClient({
        transport: new StreamableHTTPClientTransport(new URL(url)),
      })
    )
  );

  const toolSets = await Promise.all(clients.map((client) => client.tools()));

  // Tool names are unique across the three servers, so a shallow merge is safe.
  const tools = Object.assign({}, ...toolSets);

  async function close(): Promise<void> {
    await Promise.all(clients.map((client) => client.close().catch(() => {})));
  }

  return { tools, close };
}
