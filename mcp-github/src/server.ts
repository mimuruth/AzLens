/**
 * mcp-github — server factory
 * -----------------------------------------------------------------------------
 * Exposes GitHub repositories, issues, pull requests, and code via the GitHub
 * REST API. Authentication is optional: set GITHUB_TOKEN for higher rate limits
 * and access to private repositories. Tool logic lives here (createServer) and
 * is shared by the stdio (index.ts) and HTTP (http.ts) entry points.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

const GITHUB_API = "https://api.github.com";
const GITHUB_TOKEN = process.env.GITHUB_TOKEN ?? "";

type GhOptions = {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  body?: unknown;
};

/** Perform a GitHub REST request and return parsed JSON (throws on error). */
async function gh<T = unknown>(
  path: string,
  params?: Record<string, string | number | undefined>,
  options?: GhOptions
): Promise<T> {
  const url = new URL(path.startsWith("http") ? path : `${GITHUB_API}${path}`);
  for (const [k, v] of Object.entries(params ?? {})) {
    if (v !== undefined) url.searchParams.set(k, String(v));
  }
  const method = options?.method ?? "GET";
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "azlens-mcp-github",
  };
  if (GITHUB_TOKEN) headers.Authorization = `Bearer ${GITHUB_TOKEN}`;
  const init: RequestInit = { method, headers };
  if (options?.body !== undefined) {
    headers["Content-Type"] = "application/json";
    init.body = JSON.stringify(options.body);
  }

  // Retry transient failures with exponential backoff, honouring GitHub's
  // Retry-After header. Only GET is retried on network/5xx errors (writes could
  // have applied); rate-limit (429) rejections are always safe to retry.
  const idempotent = method === "GET";
  const MAX_ATTEMPTS = idempotent ? 3 : 1;
  let lastError: unknown;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    let res: Response;
    try {
      res = await fetch(url, { ...init, signal: AbortSignal.timeout(15000) });
    } catch (err) {
      lastError = err;
      if (idempotent && attempt < MAX_ATTEMPTS) {
        await sleep(backoffMs(attempt));
        continue;
      }
      throw err instanceof Error ? err : new Error(String(err));
    }

    if (res.ok) {
      if (res.status === 204) return undefined as T;
      return (await res.json().catch(() => undefined)) as T;
    }

    const retryable =
      (res.status >= 500 && idempotent) ||
      res.status === 429 ||
      isRateLimited(res);
    if (retryable && attempt < MAX_ATTEMPTS) {
      await sleep(retryAfterMs(res) ?? backoffMs(attempt));
      continue;
    }

    const body = await res.text().catch(() => "");
    let message = `GitHub API ${res.status} ${res.statusText}`;
    try {
      const parsed = JSON.parse(body) as { message?: string };
      if (parsed.message) message += `: ${parsed.message}`;
    } catch {
      /* non-JSON error body */
    }
    if ((res.status === 401 || res.status === 403) && !GITHUB_TOKEN) {
      message +=
        " (set GITHUB_TOKEN — write operations require authentication).";
    }
    throw new Error(message);
  }
  throw lastError instanceof Error
    ? lastError
    : new Error("GitHub API request failed after retries.");
}

/** Guard write tools: GitHub mutations require an authenticated token. */
function requireToken(): void {
  if (!GITHUB_TOKEN) {
    throw new Error(
      "This action modifies GitHub and requires authentication. " +
        "Set the GITHUB_TOKEN environment variable (a token with 'repo' scope) " +
        "and restart the server."
    );
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Exponential backoff with jitter: ~500ms, ~1s, ~2s. */
function backoffMs(attempt: number): number {
  return Math.round(2 ** (attempt - 1) * 500 * (0.75 + Math.random() * 0.5));
}

/** A 403/429 with the primary rate limit exhausted (remaining === 0). */
function isRateLimited(res: Response): boolean {
  return (
    (res.status === 403 || res.status === 429) &&
    res.headers.get("x-ratelimit-remaining") === "0"
  );
}

/** Parse Retry-After (seconds) or X-RateLimit-Reset (epoch seconds) → ms. */
function retryAfterMs(res: Response): number | null {
  const retryAfter = res.headers.get("retry-after");
  if (retryAfter && /^\d+$/.test(retryAfter)) {
    return Math.min(Number(retryAfter) * 1000, 10000);
  }
  const reset = res.headers.get("x-ratelimit-reset");
  if (reset && /^\d+$/.test(reset)) {
    const ms = Number(reset) * 1000 - Date.now();
    if (ms > 0) return Math.min(ms, 10000);
  }
  return null;
}

function text(value: string) {
  return { content: [{ type: "text" as const, text: value }] };
}

/** Create a fully configured mcp-github server instance. */
export function createServer(): McpServer {
  const server = new McpServer({ name: "mcp-github", version: "1.0.0" });

  // ------------------------------------------------------------------------
  // Tool: search_repositories
  // ------------------------------------------------------------------------
  server.registerTool(
    "search_repositories",
    {
      title: "Search Repositories",
      description:
        "Search public GitHub repositories. Supports GitHub search qualifiers " +
        "(e.g. 'language:typescript stars:>1000').",
      inputSchema: {
        query: z.string().min(1).describe("Search query."),
        limit: z.number().int().min(1).max(20).default(5).optional(),
      },
    },
    async ({ query, limit }) => {
      const data = await gh<{
        total_count: number;
        items: {
          full_name: string;
          description: string | null;
          stargazers_count: number;
          html_url: string;
          language: string | null;
        }[];
      }>("/search/repositories", { q: query, per_page: limit ?? 5 });
      const lines = data.items.map(
        (r) =>
          `- ${r.full_name} ⭐${r.stargazers_count}${r.language ? ` [${r.language}]` : ""}\n  ${r.description ?? ""}\n  ${r.html_url}`
      );
      return text(
        `${data.total_count} results (showing ${data.items.length}):\n\n${lines.join("\n\n")}`
      );
    }
  );

  // ------------------------------------------------------------------------
  // Tool: get_repository
  // ------------------------------------------------------------------------
  server.registerTool(
    "get_repository",
    {
      title: "Get Repository",
      description: "Fetch details about a repository (owner/repo).",
      inputSchema: {
        owner: z.string().min(1).describe("Repository owner or org."),
        repo: z.string().min(1).describe("Repository name."),
      },
    },
    async ({ owner, repo }) => {
      const r = await gh<{
        full_name: string;
        description: string | null;
        stargazers_count: number;
        forks_count: number;
        open_issues_count: number;
        language: string | null;
        default_branch: string;
        topics?: string[];
        html_url: string;
        license?: { spdx_id?: string } | null;
      }>(`/repos/${owner}/${repo}`);
      return text(
        [
          `# ${r.full_name}`,
          r.description ?? "",
          `⭐ ${r.stargazers_count}  🍴 ${r.forks_count}  ⚠ ${r.open_issues_count} open issues`,
          `Language: ${r.language ?? "n/a"}  ·  Default branch: ${r.default_branch}`,
          r.license?.spdx_id ? `License: ${r.license.spdx_id}` : "",
          r.topics?.length ? `Topics: ${r.topics.join(", ")}` : "",
          r.html_url,
        ]
          .filter(Boolean)
          .join("\n")
      );
    }
  );

  // ------------------------------------------------------------------------
  // Tool: list_issues
  // ------------------------------------------------------------------------
  server.registerTool(
    "list_issues",
    {
      title: "List Issues",
      description: "List issues in a repository (excludes pull requests).",
      inputSchema: {
        owner: z.string().min(1),
        repo: z.string().min(1),
        state: z.enum(["open", "closed", "all"]).default("open").optional(),
        limit: z.number().int().min(1).max(30).default(10).optional(),
      },
    },
    async ({ owner, repo, state, limit }) => {
      const items = await gh<
        {
          number: number;
          title: string;
          state: string;
          user: { login: string };
          pull_request?: unknown;
          html_url: string;
        }[]
      >(`/repos/${owner}/${repo}/issues`, {
        state: state ?? "open",
        per_page: limit ?? 10,
      });
      const issues = items.filter((i) => !i.pull_request);
      if (issues.length === 0) return text("No matching issues.");
      return text(
        issues
          .map(
            (i) =>
              `#${i.number} [${i.state}] ${i.title} — @${i.user.login}\n  ${i.html_url}`
          )
          .join("\n")
      );
    }
  );

  // ------------------------------------------------------------------------
  // Tool: get_issue
  // ------------------------------------------------------------------------
  server.registerTool(
    "get_issue",
    {
      title: "Get Issue",
      description: "Fetch a single issue with its body.",
      inputSchema: {
        owner: z.string().min(1),
        repo: z.string().min(1),
        number: z.number().int().positive().describe("Issue number."),
      },
    },
    async ({ owner, repo, number }) => {
      const i = await gh<{
        number: number;
        title: string;
        state: string;
        user: { login: string };
        body: string | null;
        comments: number;
        html_url: string;
      }>(`/repos/${owner}/${repo}/issues/${number}`);
      return text(
        `#${i.number} [${i.state}] ${i.title}\nby @${i.user.login} · ${i.comments} comments\n${i.html_url}\n\n${i.body ?? "(no description)"}`
      );
    }
  );

  // ------------------------------------------------------------------------
  // Tool: list_pull_requests
  // ------------------------------------------------------------------------
  server.registerTool(
    "list_pull_requests",
    {
      title: "List Pull Requests",
      description: "List pull requests in a repository.",
      inputSchema: {
        owner: z.string().min(1),
        repo: z.string().min(1),
        state: z.enum(["open", "closed", "all"]).default("open").optional(),
        limit: z.number().int().min(1).max(30).default(10).optional(),
      },
    },
    async ({ owner, repo, state, limit }) => {
      const items = await gh<
        {
          number: number;
          title: string;
          state: string;
          user: { login: string };
          draft: boolean;
          html_url: string;
        }[]
      >(`/repos/${owner}/${repo}/pulls`, {
        state: state ?? "open",
        per_page: limit ?? 10,
      });
      if (items.length === 0) return text("No matching pull requests.");
      return text(
        items
          .map(
            (p) =>
              `#${p.number} [${p.state}${p.draft ? "/draft" : ""}] ${p.title} — @${p.user.login}\n  ${p.html_url}`
          )
          .join("\n")
      );
    }
  );

  // ------------------------------------------------------------------------
  // Tool: get_file_contents
  // ------------------------------------------------------------------------
  server.registerTool(
    "get_file_contents",
    {
      title: "Get File Contents",
      description: "Read a text file from a repository at an optional ref.",
      inputSchema: {
        owner: z.string().min(1),
        repo: z.string().min(1),
        path: z.string().min(1).describe("File path within the repo."),
        ref: z.string().optional().describe("Branch, tag, or commit SHA."),
      },
    },
    async ({ owner, repo, path, ref }) => {
      const data = await gh<{
        content?: string;
        encoding?: string;
        size: number;
        type: string;
      }>(`/repos/${owner}/${repo}/contents/${path}`, { ref });
      if (data.type !== "file" || !data.content) {
        return text(`"${path}" is not a readable file.`);
      }
      const decoded = Buffer.from(data.content, "base64").toString("utf-8");
      const clipped =
        decoded.length > 20000
          ? `${decoded.slice(0, 20000)}\n… (truncated, ${data.size} bytes total)`
          : decoded;
      return text(clipped);
    }
  );

  // ------------------------------------------------------------------------
  // Tool: create_issue (write — requires GITHUB_TOKEN)
  // ------------------------------------------------------------------------
  server.registerTool(
    "create_issue",
    {
      title: "Create Issue",
      description:
        "Open a new issue in a repository. Requires an authenticated " +
        "GITHUB_TOKEN with write access. This modifies GitHub.",
      inputSchema: {
        owner: z.string().min(1),
        repo: z.string().min(1),
        title: z.string().min(1).describe("Issue title."),
        body: z.string().optional().describe("Issue body (Markdown)."),
        labels: z
          .array(z.string())
          .optional()
          .describe("Label names to apply."),
      },
    },
    async ({ owner, repo, title, body, labels }) => {
      requireToken();
      const i = await gh<{ number: number; html_url: string }>(
        `/repos/${owner}/${repo}/issues`,
        undefined,
        { method: "POST", body: { title, body, labels } }
      );
      return text(`Created issue #${i.number}: ${i.html_url}`);
    }
  );

  // ------------------------------------------------------------------------
  // Tool: add_issue_comment (write — requires GITHUB_TOKEN)
  // ------------------------------------------------------------------------
  server.registerTool(
    "add_issue_comment",
    {
      title: "Add Issue Comment",
      description:
        "Add a comment to an issue or pull request. Requires an authenticated " +
        "GITHUB_TOKEN with write access. This modifies GitHub.",
      inputSchema: {
        owner: z.string().min(1),
        repo: z.string().min(1),
        number: z.number().int().positive().describe("Issue or PR number."),
        body: z.string().min(1).describe("Comment body (Markdown)."),
      },
    },
    async ({ owner, repo, number, body }) => {
      requireToken();
      const c = await gh<{ html_url: string }>(
        `/repos/${owner}/${repo}/issues/${number}/comments`,
        undefined,
        { method: "POST", body: { body } }
      );
      return text(`Comment added: ${c.html_url}`);
    }
  );

  // ------------------------------------------------------------------------
  // Tool: create_pull_request (write — requires GITHUB_TOKEN)
  // ------------------------------------------------------------------------
  server.registerTool(
    "create_pull_request",
    {
      title: "Create Pull Request",
      description:
        "Open a pull request from an existing head branch into a base branch. " +
        "Requires an authenticated GITHUB_TOKEN with write access. This " +
        "modifies GitHub.",
      inputSchema: {
        owner: z.string().min(1),
        repo: z.string().min(1),
        title: z.string().min(1).describe("Pull request title."),
        head: z
          .string()
          .min(1)
          .describe("Branch with your changes (e.g. 'feature-x')."),
        base: z.string().min(1).describe("Branch to merge into (e.g. 'main')."),
        body: z.string().optional().describe("PR description (Markdown)."),
        draft: z.boolean().optional().describe("Open as a draft PR."),
      },
    },
    async ({ owner, repo, title, head, base, body, draft }) => {
      requireToken();
      const pr = await gh<{ number: number; html_url: string }>(
        `/repos/${owner}/${repo}/pulls`,
        undefined,
        { method: "POST", body: { title, head, base, body, draft } }
      );
      return text(`Created pull request #${pr.number}: ${pr.html_url}`);
    }
  );

  // ------------------------------------------------------------------------
  // Resource: API rate limit
  // ------------------------------------------------------------------------
  server.registerResource(
    "rate-limit",
    "github://rate-limit",
    {
      title: "GitHub Rate Limit",
      description: "Current GitHub REST API rate limit for this server.",
      mimeType: "text/plain",
    },
    async (uri) => {
      const data = await gh<{
        rate: { limit: number; remaining: number; reset: number };
      }>("/rate_limit");
      const reset = new Date(data.rate.reset * 1000).toISOString();
      return {
        contents: [
          {
            uri: uri.href,
            mimeType: "text/plain",
            text:
              `Rate limit: ${data.rate.remaining}/${data.rate.limit} remaining.\n` +
              `Resets at ${reset}.\n` +
              `Auth: ${GITHUB_TOKEN ? "token" : "anonymous"}.`,
          },
        ],
      };
    }
  );

  // ------------------------------------------------------------------------
  // Prompts
  // ------------------------------------------------------------------------
  server.registerPrompt(
    "triage-issue",
    {
      title: "Triage an issue",
      description: "Summarise and suggest labels/next steps for an issue.",
      argsSchema: {
        owner: z.string().describe("Repository owner."),
        repo: z.string().describe("Repository name."),
        number: z.string().describe("Issue number."),
      },
    },
    ({ owner, repo, number }) => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: `Use get_issue for ${owner}/${repo} #${number}. Summarise the problem, assess severity, suggest labels, and propose concrete next steps.`,
          },
        },
      ],
    })
  );

  server.registerPrompt(
    "summarize-repo",
    {
      title: "Summarise a repository",
      description: "Give an overview of a repository and its activity.",
      argsSchema: {
        owner: z.string().describe("Repository owner."),
        repo: z.string().describe("Repository name."),
      },
    },
    ({ owner, repo }) => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: `Use get_repository and list_issues / list_pull_requests for ${owner}/${repo}. Summarise what the project does, its health, and any notable open work.`,
          },
        },
      ],
    })
  );

  return server;
}
