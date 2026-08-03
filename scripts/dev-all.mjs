#!/usr/bin/env node
/**
 * dev-all — launch the whole AzLens stack locally with one command.
 * -----------------------------------------------------------------------------
 * Builds each MCP server if needed, starts all six on their HTTP transports
 * (ports 3001–3006), and starts the chat-ui dev server (port 3000). Output from
 * every process is prefixed with a colour-coded label. Press Ctrl+C once to stop
 * everything.
 *
 *   npm run dev:all
 *
 * Environment variables you set before running are inherited by the children,
 * so `az login` (for Azure-backed servers) and chat-ui/.env.local still apply.
 * Skip the one-time build step with SKIP_BUILD=1.
 */

import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SKIP_BUILD = process.env.SKIP_BUILD === "1";
const WIN = process.platform === "win32";

// ANSI colours for per-process prefixes (falls back to no colour if unsupported).
const COLORS = [36, 32, 33, 35, 34, 92, 95];
const RESET = "\u001b[0m";

const SANDBOX = path.join(ROOT, "sandbox");

/** MCP servers: dir, port, and any extra env they need. */
const SERVERS = [
  {
    name: "local-coder",
    dir: "mcp-local-coder",
    port: 3001,
    env: { WORKSPACE_ROOT: SANDBOX },
  },
  { name: "azlens", dir: "AzLens-mcp", port: 3002, env: {} },
  { name: "assistant", dir: "mcp-personal-assistant", port: 3003, env: {} },
  { name: "github", dir: "mcp-github", port: 3004, env: {} },
  { name: "cost", dir: "mcp-azure-cost", port: 3005, env: {} },
  { name: "knowledge", dir: "mcp-knowledge", port: 3006, env: {} },
  { name: "postgres", dir: "mcp-postgres", port: 3007, env: {} },
  { name: "memory", dir: "mcp-memory", port: 3008, env: {} },
];

const children = [];
let shuttingDown = false;

function color(i) {
  return `\u001b[${COLORS[i % COLORS.length]}m`;
}

function pipe(label, colorCode, stream) {
  let buffer = "";
  stream.on("data", (chunk) => {
    buffer += chunk.toString();
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      process.stdout.write(`${colorCode}[${label}]${RESET} ${line}\n`);
    }
  });
}

/** Ensure a project has installed deps and a built HTTP entry point. */
function ensureBuilt(dir) {
  const projectDir = path.join(ROOT, dir);
  if (!existsSync(path.join(projectDir, "node_modules"))) {
    console.log(`… installing dependencies for ${dir}`);
    runSync("npm install --no-audit --no-fund", projectDir);
  }
  if (SKIP_BUILD) return;
  if (!existsSync(path.join(projectDir, "build", "http.js"))) {
    console.log(`… building ${dir}`);
    runSync("npm run build", projectDir);
  }
}

function runSync(command, cwd) {
  const res = spawnSync(command, { cwd, shell: true, stdio: "inherit" });
  if (res.status !== 0) {
    console.error(`\`${command}\` failed in ${cwd}`);
    process.exit(1);
  }
}

function start(label, colorCode, command, cwd, env) {
  const child = spawn(command, {
    cwd: path.join(ROOT, cwd),
    env: { ...process.env, ...env },
    shell: true,
  });
  pipe(label, colorCode, child.stdout);
  pipe(label, colorCode, child.stderr);
  child.on("exit", (code) => {
    if (!shuttingDown) {
      process.stdout.write(
        `${colorCode}[${label}]${RESET} exited (code ${code})\n`
      );
    }
  });
  children.push(child);
}

function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log("\nStopping all processes…");
  for (const child of children) {
    try {
      if (WIN && child.pid) {
        spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"]);
      } else {
        child.kill("SIGINT");
      }
    } catch {
      /* already gone */
    }
  }
  setTimeout(() => process.exit(0), 500);
}

// --- main -------------------------------------------------------------------
if (!existsSync(SANDBOX)) mkdirSync(SANDBOX, { recursive: true });

console.log("Preparing AzLens stack (build once, then start)…\n");
for (const s of SERVERS) ensureBuilt(s.dir);
if (!existsSync(path.join(ROOT, "chat-ui", "node_modules"))) {
  console.log("… installing dependencies for chat-ui");
  runSync("npm install --no-audit --no-fund", path.join(ROOT, "chat-ui"));
}

console.log("\nStarting servers + UI. Press Ctrl+C to stop.\n");
SERVERS.forEach((s, i) =>
  start(s.name, color(i), "node build/http.js", s.dir, {
    PORT: String(s.port),
    ...s.env,
  })
);
start("chat-ui", color(SERVERS.length), "npm run dev", "chat-ui", {});

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
