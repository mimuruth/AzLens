/**
 * mcp-local-coder — server factory
 * -----------------------------------------------------------------------------
 * Builds and configures the McpServer instance and registers all tools.
 * Both the stdio entry point (index.ts) and the HTTP entry point (http.ts)
 * import `createServer()` so the tool logic lives in exactly one place.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { promises as fs } from "node:fs";
import path from "node:path";

/**
 * Root directory the server is allowed to operate within. Defaults to the
 * current working directory but can be overridden with the WORKSPACE_ROOT
 * environment variable. All paths are resolved relative to (and constrained
 * within) this root to prevent path-traversal outside the workspace.
 */
export const WORKSPACE_ROOT = path.resolve(
  process.env.WORKSPACE_ROOT ?? process.cwd()
);

/** Directories that are skipped when performing a recursive code search. */
const IGNORED_DIRECTORIES = new Set([
  "node_modules",
  ".git",
  "build",
  "dist",
  ".next",
  "out",
]);

/**
 * Resolve a user-supplied path against the workspace root and ensure the
 * result stays inside the sandbox. Throws if the path escapes the root.
 */
function resolveSafePath(userPath: string): string {
  const resolved = path.resolve(WORKSPACE_ROOT, userPath);
  const relative = path.relative(WORKSPACE_ROOT, resolved);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(
      `Access denied: "${userPath}" is outside the permitted workspace root.`
    );
  }
  return resolved;
}

/** Create a fully configured mcp-local-coder server instance. */
export function createServer(): McpServer {
  const server = new McpServer({
    name: "mcp-local-coder",
    version: "1.0.0",
  });

  // -------------------------------------------------------------------------
  // Tool: read_file
  // -------------------------------------------------------------------------
  server.registerTool(
    "read_file",
    {
      title: "Read File",
      description:
        "Read the full contents of a text file located inside the workspace.",
      inputSchema: {
        path: z
          .string()
          .min(1)
          .describe("Path to the file, relative to the workspace root."),
      },
    },
    async ({ path: filePath }) => {
      const target = resolveSafePath(filePath);
      const content = await fs.readFile(target, "utf-8");
      return {
        content: [{ type: "text", text: content }],
      };
    }
  );

  // -------------------------------------------------------------------------
  // Tool: write_file
  // -------------------------------------------------------------------------
  server.registerTool(
    "write_file",
    {
      title: "Write File",
      description:
        "Create a new file or overwrite an existing one with the supplied content. " +
        "Parent directories are created automatically.",
      inputSchema: {
        path: z
          .string()
          .min(1)
          .describe("Path to the file, relative to the workspace root."),
        content: z.string().describe("Full content to write to the file."),
      },
    },
    async ({ path: filePath, content }) => {
      const target = resolveSafePath(filePath);
      await fs.mkdir(path.dirname(target), { recursive: true });
      await fs.writeFile(target, content, "utf-8");
      return {
        content: [
          {
            type: "text",
            text: `Wrote ${Buffer.byteLength(content, "utf-8")} bytes to ${filePath}.`,
          },
        ],
      };
    }
  );

  // -------------------------------------------------------------------------
  // Tool: search_code
  // -------------------------------------------------------------------------
  server.registerTool(
    "search_code",
    {
      title: "Search Code",
      description:
        "Recursively search the workspace for a case-insensitive text query and " +
        "return matching files with line numbers.",
      inputSchema: {
        query: z.string().min(1).describe("Text to search for."),
      },
    },
    async ({ query }) => {
      const matches: string[] = [];
      const needle = query.toLowerCase();

      async function walk(dir: string): Promise<void> {
        const entries = await fs.readdir(dir, { withFileTypes: true });
        for (const entry of entries) {
          const full = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            if (IGNORED_DIRECTORIES.has(entry.name)) continue;
            await walk(full);
          } else if (entry.isFile()) {
            try {
              const text = await fs.readFile(full, "utf-8");
              const lines = text.split(/\r?\n/);
              lines.forEach((line, i) => {
                if (line.toLowerCase().includes(needle)) {
                  const rel = path.relative(WORKSPACE_ROOT, full);
                  matches.push(`${rel}:${i + 1}: ${line.trim()}`);
                }
              });
            } catch {
              // Skip binary or unreadable files.
            }
          }
        }
      }

      await walk(WORKSPACE_ROOT);

      const text = matches.length
        ? matches.slice(0, 200).join("\n")
        : `No matches found for "${query}".`;

      return {
        content: [{ type: "text", text }],
      };
    }
  );

  return server;
}
