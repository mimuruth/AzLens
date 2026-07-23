/**
 * mcp-postgres — server factory
 * -----------------------------------------------------------------------------
 * Read-only access to a PostgreSQL database: list tables, describe columns, and
 * run SELECT queries. All queries execute inside a READ ONLY transaction with a
 * statement timeout, so writes are rejected by the database itself. Connection
 * is configured with DATABASE_URL; the server starts without it and returns a
 * clear hint until it is set. Tool logic lives here and is shared by the stdio
 * (index.ts) and HTTP (http.ts) entry points.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import pg from "pg";

const DATABASE_URL = process.env.DATABASE_URL ?? "";
const STATEMENT_TIMEOUT_MS = Number(
  process.env.PG_STATEMENT_TIMEOUT_MS ?? 15000
);

let pool: pg.Pool | undefined;

function getPool(): pg.Pool {
  if (!DATABASE_URL) {
    throw new Error(
      "PostgreSQL is not configured: set DATABASE_URL in the environment."
    );
  }
  if (!pool) {
    pool = new pg.Pool({
      connectionString: DATABASE_URL,
      max: 3,
      ssl:
        process.env.PGSSL === "disable" ? false : { rejectUnauthorized: false },
    });
  }
  return pool;
}

function notConfigured(): string | null {
  if (!DATABASE_URL) {
    return (
      "PostgreSQL is not configured: set DATABASE_URL (e.g. " +
      "postgresql://user:pass@host:5432/db) in the environment. Azure Database " +
      "for PostgreSQL requires SSL (on by default)."
    );
  }
  return null;
}

function text(value: string) {
  return { content: [{ type: "text" as const, text: value }] };
}

/** Render query rows as a compact Markdown table (capped). */
function renderRows(rows: Record<string, unknown>[], cap: number): string {
  if (rows.length === 0) return "(0 rows)";
  const cols = Object.keys(rows[0]);
  const clip = rows.slice(0, cap);
  const cell = (v: unknown) =>
    v == null
      ? ""
      : typeof v === "object"
        ? JSON.stringify(v)
        : String(v).replace(/\|/g, "\\|").replace(/\n/g, " ");
  const header = `| ${cols.join(" | ")} |`;
  const sep = `| ${cols.map(() => "---").join(" | ")} |`;
  const body = clip
    .map((r) => `| ${cols.map((c) => cell(r[c])).join(" | ")} |`)
    .join("\n");
  const more =
    rows.length > cap ? `\n\n…and ${rows.length - cap} more rows.` : "";
  return `${header}\n${sep}\n${body}${more}`;
}

/** Guard: only single SELECT/WITH statements are allowed to reach the DB. */
function isReadOnlyQuery(sql: string): boolean {
  const trimmed = sql.trim().replace(/;\s*$/, "");
  if (/;/.test(trimmed)) return false; // no multiple statements
  return /^(select|with)\b/i.test(trimmed);
}

/** Create a fully configured mcp-postgres server instance. */
export function createServer(): McpServer {
  const server = new McpServer({ name: "mcp-postgres", version: "1.0.0" });

  // ------------------------------------------------------------------------
  // Tool: list_tables
  // ------------------------------------------------------------------------
  server.registerTool(
    "list_tables",
    {
      title: "List Tables",
      description: "List tables (and views) in a schema (default 'public').",
      inputSchema: {
        schema: z.string().default("public").optional(),
      },
    },
    async ({ schema }) => {
      const hint = notConfigured();
      if (hint) return text(hint);
      const res = await getPool().query(
        `SELECT table_name, table_type
         FROM information_schema.tables
         WHERE table_schema = $1
         ORDER BY table_name`,
        [schema ?? "public"]
      );
      if (res.rows.length === 0) {
        return text(`No tables in schema "${schema ?? "public"}".`);
      }
      return text(
        `Tables in "${schema ?? "public"}":\n\n` +
          res.rows
            .map(
              (r) =>
                `- ${r.table_name}${r.table_type === "VIEW" ? " (view)" : ""}`
            )
            .join("\n")
      );
    }
  );

  // ------------------------------------------------------------------------
  // Tool: describe_table
  // ------------------------------------------------------------------------
  server.registerTool(
    "describe_table",
    {
      title: "Describe Table",
      description: "Show the columns and types of a table.",
      inputSchema: {
        table: z.string().min(1).describe("Table name."),
        schema: z.string().default("public").optional(),
      },
    },
    async ({ table, schema }) => {
      const hint = notConfigured();
      if (hint) return text(hint);
      const res = await getPool().query(
        `SELECT column_name, data_type, is_nullable, column_default
         FROM information_schema.columns
         WHERE table_schema = $1 AND table_name = $2
         ORDER BY ordinal_position`,
        [schema ?? "public", table]
      );
      if (res.rows.length === 0) {
        return text(`Table "${schema ?? "public"}.${table}" not found.`);
      }
      return text(
        `Columns of "${schema ?? "public"}.${table}":\n\n` +
          renderRows(res.rows as Record<string, unknown>[], 200)
      );
    }
  );

  // ------------------------------------------------------------------------
  // Tool: query (read-only)
  // ------------------------------------------------------------------------
  server.registerTool(
    "query",
    {
      title: "Run Read-only Query",
      description:
        "Run a single read-only SQL query (SELECT/WITH only). Executes inside " +
        "a READ ONLY transaction with a statement timeout; writes are rejected.",
      inputSchema: {
        sql: z.string().min(1).describe("A single SELECT/WITH statement."),
        limit: z
          .number()
          .int()
          .min(1)
          .max(200)
          .default(50)
          .optional()
          .describe("Max rows to render."),
      },
    },
    async ({ sql, limit }) => {
      const hint = notConfigured();
      if (hint) return text(hint);
      if (!isReadOnlyQuery(sql)) {
        return text(
          "Only a single read-only SELECT/WITH statement is allowed."
        );
      }
      const client = await getPool().connect();
      try {
        await client.query(`SET statement_timeout = ${STATEMENT_TIMEOUT_MS}`);
        await client.query("BEGIN TRANSACTION READ ONLY");
        const res = await client.query(sql);
        await client.query("ROLLBACK");
        return text(
          `${res.rowCount ?? res.rows.length} row(s):\n\n` +
            renderRows(res.rows as Record<string, unknown>[], limit ?? 50)
        );
      } catch (err) {
        try {
          await client.query("ROLLBACK");
        } catch {
          /* ignore */
        }
        const detail = err instanceof Error ? err.message : String(err);
        return text(`Query error: ${detail}`);
      } finally {
        client.release();
      }
    }
  );

  // ------------------------------------------------------------------------
  // Resource: connection context
  // ------------------------------------------------------------------------
  server.registerResource(
    "context",
    "postgres://context",
    {
      title: "PostgreSQL Context",
      description: "Connection status and configured database.",
      mimeType: "text/plain",
    },
    async (uri) => {
      const hint = notConfigured();
      let dbName = "(unknown)";
      if (!hint) {
        try {
          const r = await getPool().query("SELECT current_database() AS db");
          dbName = String(r.rows[0]?.db ?? "(unknown)");
        } catch (err) {
          dbName = `(error: ${err instanceof Error ? err.message : err})`;
        }
      }
      return {
        contents: [
          {
            uri: uri.href,
            mimeType: "text/plain",
            text:
              `Configured: ${DATABASE_URL ? "yes" : "no"}\n` +
              `Database: ${dbName}\n` +
              `Access: read-only (SELECT/WITH), ${STATEMENT_TIMEOUT_MS}ms timeout\n` +
              (hint ? `Hint: ${hint}` : "Ready to query."),
          },
        ],
      };
    }
  );

  // ------------------------------------------------------------------------
  // Prompt: explore schema
  // ------------------------------------------------------------------------
  server.registerPrompt(
    "explore-schema",
    {
      title: "Explore the database schema",
      description: "List tables and summarise the data model.",
      argsSchema: {},
    },
    () => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: "Use list_tables and describe_table to explore this PostgreSQL database, then summarise the schema: the main tables, their key columns, and how they appear to relate.",
          },
        },
      ],
    })
  );

  return server;
}
