/**
 * mcp-personal-assistant — server factory
 * -----------------------------------------------------------------------------
 * Builds and configures the McpServer instance and registers all tools.
 * Both the stdio entry point (index.ts) and the HTTP entry point (http.ts)
 * import `createServer()` so the tool logic lives in exactly one place.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";

/** Directory where notes and the to-do list live. */
export const NOTES_ROOT = path.resolve(
  process.env.NOTES_ROOT ?? path.join(os.homedir(), "mcp-notes")
);

const TODO_FILE = path.join(NOTES_ROOT, "todo.md");

/** Allowed to-do statuses and their markdown checkbox representation. */
const STATUS_CHECKBOX: Record<string, string> = {
  todo: "[ ]",
  "in-progress": "[~]",
  done: "[x]",
};

async function ensureNotesRoot(): Promise<void> {
  await fs.mkdir(NOTES_ROOT, { recursive: true });
}

/** Create a fully configured mcp-personal-assistant server instance. */
export function createServer(): McpServer {
  const server = new McpServer({
    name: "mcp-personal-assistant",
    version: "1.0.0",
  });

  // -------------------------------------------------------------------------
  // Tool: get_daily_notes
  // -------------------------------------------------------------------------
  server.registerTool(
    "get_daily_notes",
    {
      title: "Get Daily Notes",
      description:
        "Retrieve the markdown notes for a specific date. If no notes exist yet, " +
        "an empty placeholder is returned.",
      inputSchema: {
        date: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be in YYYY-MM-DD format.")
          .describe("The date to fetch notes for, formatted as YYYY-MM-DD."),
      },
    },
    async ({ date }) => {
      await ensureNotesRoot();
      const notePath = path.join(NOTES_ROOT, `${date}.md`);
      let content: string;
      try {
        content = await fs.readFile(notePath, "utf-8");
      } catch {
        content = `# Notes for ${date}\n\n_No notes recorded yet._`;
      }
      return {
        content: [{ type: "text", text: content }],
      };
    }
  );

  // -------------------------------------------------------------------------
  // Tool: update_todo_list
  // -------------------------------------------------------------------------
  server.registerTool(
    "update_todo_list",
    {
      title: "Update To-Do List",
      description:
        "Add a new task or update the status of an existing task in the " +
        "persistent to-do list.",
      inputSchema: {
        task: z.string().min(1).describe("The task description."),
        status: z
          .enum(["todo", "in-progress", "done"])
          .describe("The status of the task."),
      },
    },
    async ({ task, status }) => {
      await ensureNotesRoot();
      const checkbox = STATUS_CHECKBOX[status];

      let lines: string[] = [];
      try {
        const existing = await fs.readFile(TODO_FILE, "utf-8");
        lines = existing.split(/\r?\n/);
      } catch {
        lines = ["# To-Do List", ""];
      }

      // Match a line that ends with the same task text (ignoring checkbox state).
      const taskRegex = new RegExp(
        `- \\[.\\] ${task.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`
      );
      const index = lines.findIndex((line) => taskRegex.test(line));
      const entry = `- ${checkbox} ${task}`;

      if (index >= 0) {
        lines[index] = entry;
      } else {
        lines.push(entry);
      }

      await fs.writeFile(TODO_FILE, lines.join("\n"), "utf-8");

      return {
        content: [
          { type: "text", text: `Task "${task}" set to status "${status}".` },
        ],
      };
    }
  );

  // -------------------------------------------------------------------------
  // Resource: current to-do list
  // -------------------------------------------------------------------------
  server.registerResource(
    "todo-list",
    "assistant://todo",
    {
      title: "To-Do List",
      description: "The persistent markdown to-do list.",
      mimeType: "text/markdown",
    },
    async (uri) => {
      let text: string;
      try {
        text = await fs.readFile(TODO_FILE, "utf-8");
      } catch {
        text = "# To-Do List\n\n_No tasks yet._";
      }
      return {
        contents: [{ uri: uri.href, mimeType: "text/markdown", text }],
      };
    }
  );

  // -------------------------------------------------------------------------
  // Resource: today's notes
  // -------------------------------------------------------------------------
  server.registerResource(
    "today-notes",
    "assistant://notes/today",
    {
      title: "Today's Notes",
      description: "Markdown notes recorded for the current day.",
      mimeType: "text/markdown",
    },
    async (uri) => {
      const today = new Date().toISOString().slice(0, 10);
      const notePath = path.join(NOTES_ROOT, `${today}.md`);
      let text: string;
      try {
        text = await fs.readFile(notePath, "utf-8");
      } catch {
        text = `# Notes for ${today}\n\n_No notes recorded yet._`;
      }
      return {
        contents: [{ uri: uri.href, mimeType: "text/markdown", text }],
      };
    }
  );

  // -------------------------------------------------------------------------
  // Prompt: plan my day
  // -------------------------------------------------------------------------
  server.registerPrompt(
    "plan-my-day",
    {
      title: "Plan my day",
      description: "Turn today's notes and to-dos into a prioritised plan.",
      argsSchema: {},
    },
    () => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: "Read today's notes with get_daily_notes and review my to-do list, then propose a prioritised plan for the day with time estimates. Highlight anything urgent.",
          },
        },
      ],
    })
  );

  return server;
}
