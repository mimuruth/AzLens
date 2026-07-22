/**
 * Server-side health check for the configured MCP servers.
 * The browser can't reach the MCP servers directly (CORS / private ingress),
 * so this route pings each one from the server and returns simple statuses.
 */
export const runtime = "nodejs";

type ServerHealth = { name: string; ok: boolean; configured: boolean };

const SERVERS = [
  { name: "mcp-local-coder", url: process.env.MCP_LOCAL_CODER_URL },
  { name: "AzLens-mcp", url: process.env.MCP_AZLENS_URL },
  {
    name: "mcp-personal-assistant",
    url: process.env.MCP_PERSONAL_ASSISTANT_URL,
  },
  { name: "mcp-github", url: process.env.MCP_GITHUB_URL },
];

async function ping(url: string): Promise<boolean> {
  const healthUrl = url.replace(/\/mcp\/?$/, "/health");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 3000);
  try {
    const res = await fetch(healthUrl, {
      signal: controller.signal,
      cache: "no-store",
    });
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

export async function GET(): Promise<Response> {
  const results: ServerHealth[] = await Promise.all(
    SERVERS.map(async (s) => {
      if (!s.url) return { name: s.name, ok: false, configured: false };
      return { name: s.name, ok: await ping(s.url), configured: true };
    })
  );
  return Response.json(results);
}
