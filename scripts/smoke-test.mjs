#!/usr/bin/env node
/**
 * Smoke test for the MCP servers.
 * -----------------------------------------------------------------------------
 * Spawns each server over stdio, connects an MCP client, lists its tools, and
 * exercises a safe round-trip. Azure-dependent tools in AzLens-mcp are NOT
 * called (they need credentials); only `tools/list` and the offline
 * `search_wiki` stub are checked there.
 *
 * Usage:
 *   npm run smoke            # builds each server if needed, then tests
 *   SKIP_BUILD=1 npm run smoke
 *
 * Exit code is non-zero if any check fails, so it can gate CI.
 */

import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SKIP_BUILD = process.env.SKIP_BUILD === "1";

/** @type {{ name: string, ok: boolean, detail: string }[]} */
const results = [];

function check(name, ok, detail = "") {
  results.push({ name, ok: !!ok, detail });
  const mark = ok ? "\u2713" : "\u2717";
  console.log(`  ${mark} ${name}${!ok && detail ? ` \u2014 ${detail}` : ""}`);
}

/** Extract concatenated text from an MCP tool result. */
function textOf(result) {
  return (result?.content ?? [])
    .filter((c) => c.type === "text")
    .map((c) => c.text)
    .join("\n");
}

/** Ensure a server project is installed and built. */
function ensureBuilt(dir) {
  const projectDir = path.join(ROOT, dir);
  if (SKIP_BUILD) return projectDir;
  if (!existsSync(path.join(projectDir, "node_modules"))) {
    console.log(`  … installing dependencies for ${dir}`);
    run("npm", ["install", "--no-audit", "--no-fund"], projectDir);
  }
  if (!existsSync(path.join(projectDir, "build", "index.js"))) {
    console.log(`  … building ${dir}`);
    run("npm", ["run", "build"], projectDir);
  }
  return projectDir;
}

function run(cmd, args, cwd) {
  const res = spawnSync(cmd, args, {
    cwd,
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  if (res.status !== 0) {
    throw new Error(`\`${cmd} ${args.join(" ")}\` failed in ${cwd}`);
  }
}

/** Connect an MCP client to a server started via `node build/index.js`. */
async function connect(dir, envOverrides = {}) {
  const projectDir = ensureBuilt(dir);
  const transport = new StdioClientTransport({
    command: process.execPath, // node
    args: [path.join(projectDir, "build", "index.js")],
    cwd: projectDir,
    env: { ...process.env, ...envOverrides },
  });
  const client = new Client(
    { name: "smoke-test", version: "1.0.0" },
    { capabilities: {} }
  );
  await client.connect(transport);
  return client;
}

function toolNames(list) {
  return (list?.tools ?? []).map((t) => t.name);
}

async function testLocalCoder() {
  console.log("\nmcp-local-coder");
  const workspace = mkdtempSync(path.join(tmpdir(), "mcp-coder-"));
  const client = await connect("mcp-local-coder", {
    WORKSPACE_ROOT: workspace,
  });
  try {
    const names = toolNames(await client.listTools());
    check(
      "lists read_file, write_file, search_code",
      ["read_file", "write_file", "search_code"].every((n) =>
        names.includes(n)
      ),
      names.join(", ")
    );

    await client.callTool({
      name: "write_file",
      arguments: { path: "hello.txt", content: "hello smoke test" },
    });
    const read = textOf(
      await client.callTool({
        name: "read_file",
        arguments: { path: "hello.txt" },
      })
    );
    check(
      "write_file + read_file round-trip",
      read.includes("hello smoke test")
    );

    const search = textOf(
      await client.callTool({
        name: "search_code",
        arguments: { query: "smoke" },
      })
    );
    check("search_code finds the written file", search.includes("hello.txt"));
  } finally {
    await client.close();
  }
}

async function testPersonalAssistant() {
  console.log("\nmcp-personal-assistant");
  const notes = mkdtempSync(path.join(tmpdir(), "mcp-notes-"));
  const client = await connect("mcp-personal-assistant", {
    NOTES_ROOT: notes,
  });
  try {
    const names = toolNames(await client.listTools());
    check(
      "lists get_daily_notes, update_todo_list",
      ["get_daily_notes", "update_todo_list"].every((n) => names.includes(n)),
      names.join(", ")
    );

    const update = textOf(
      await client.callTool({
        name: "update_todo_list",
        arguments: { task: "ship v1", status: "done" },
      })
    );
    check("update_todo_list confirms status", update.includes("done"));

    const daily = textOf(
      await client.callTool({
        name: "get_daily_notes",
        arguments: { date: "2025-01-01" },
      })
    );
    check("get_daily_notes returns content", daily.length > 0);
  } finally {
    await client.close();
  }
}

async function testAzLens() {
  console.log("\nAzLens-mcp (offline checks only)");
  const client = await connect("AzLens-mcp", {});
  try {
    const names = toolNames(await client.listTools());
    check(
      "lists query_azure_resource, run_kql_query, search_wiki",
      ["query_azure_resource", "run_kql_query", "search_wiki"].every((n) =>
        names.includes(n)
      ),
      names.join(", ")
    );

    const wiki = textOf(
      await client.callTool({
        name: "search_wiki",
        arguments: { query: "azure functions" },
      })
    );
    check("search_wiki responds with text", wiki.length > 0, wiki.slice(0, 60));
  } finally {
    await client.close();
  }
}

async function testGitHub() {
  console.log("\nmcp-github (offline checks only)");
  const client = await connect("mcp-github", {});
  try {
    const names = toolNames(await client.listTools());
    check(
      "lists search_repositories, get_repository, list_issues",
      ["search_repositories", "get_repository", "list_issues"].every((n) =>
        names.includes(n)
      ),
      names.join(", ")
    );
    check(
      "lists write tools create_issue, add_issue_comment, create_pull_request",
      ["create_issue", "add_issue_comment", "create_pull_request"].every((n) =>
        names.includes(n)
      ),
      names.join(", ")
    );
    const prompts = (await client.listPrompts()).prompts.map((p) => p.name);
    check(
      "lists prompts triage-issue, summarize-repo",
      ["triage-issue", "summarize-repo"].every((n) => prompts.includes(n)),
      prompts.join(", ")
    );
  } finally {
    await client.close();
  }
}

async function testAzureCost() {
  console.log("\nmcp-azure-cost (offline checks only)");
  const client = await connect("mcp-azure-cost", {});
  try {
    const names = toolNames(await client.listTools());
    check(
      "lists query_cost, get_cost_forecast, list_budgets",
      ["query_cost", "get_cost_forecast", "list_budgets"].every((n) =>
        names.includes(n)
      ),
      names.join(", ")
    );
    const prompts = (await client.listPrompts()).prompts.map((p) => p.name);
    check(
      "lists prompt cost-review",
      prompts.includes("cost-review"),
      prompts.join(", ")
    );
    // query_cost with no Azure creds should return a clear hint, not crash.
    const res = await client.callTool({
      name: "query_cost",
      arguments: { timeframe: "MonthToDate" },
    });
    const out = textOf(res);
    check(
      "query_cost returns a graceful message without credentials",
      out.length > 0,
      out.slice(0, 60)
    );
  } finally {
    await client.close();
  }
}

async function main() {
  console.log("Running MCP smoke tests…");
  for (const test of [
    testLocalCoder,
    testPersonalAssistant,
    testAzLens,
    testGitHub,
    testAzureCost,
  ]) {
    try {
      await test();
    } catch (err) {
      check(`${test.name} crashed`, false, String(err?.message ?? err));
    }
  }

  const failed = results.filter((r) => !r.ok);
  console.log(
    `\n${results.length - failed.length}/${results.length} checks passed.`
  );
  if (failed.length > 0) {
    console.error("Smoke test FAILED.");
    process.exit(1);
  }
  console.log("Smoke test PASSED.");
}

main().catch((err) => {
  console.error("Unexpected error:", err);
  process.exit(1);
});
