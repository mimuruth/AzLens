---
name: add-mcp-server
description: >-
  Scaffold and wire a new MCP server into the AzLens monorepo end-to-end. Use
  when asked to "add a new MCP server", "create an MCP server", "add a tool
  server", "expose <domain> as MCP", or to register a new server across chat-ui,
  dev tooling, infra, and docs. Covers the package skeleton (server/stdio/http),
  the chat-ui client wiring, dev-all, Bicep, and validation.
---

# Add a new MCP server to AzLens

AzLens servers are decoupled packages that each ship **two transports from one
codebase**: `src/server.ts` (logic) is reused by `src/index.ts` (stdio) and
`src/http.ts` (Streamable HTTP). Adding one means creating the package **and**
registering it in ~6 wiring points. Do every step or the server won't appear in
chat-ui.

Pick the next free port: existing servers use **3001–3007**, so a new one is
**3008** (chat-ui is 3000). Use a kebab-case name, e.g. `mcp-weather`, and a
`ServerKey` like `weather`.

## 1. Scaffold the package `mcp-<name>/`

Copy an existing simple server (`mcp-postgres/` is a good template) and adapt.
Required files:

- `package.json` — `"type": "module"`, `main`/`bin` → `build/index.js`, and the
  standard scripts: `build` (`tsc && chmod +x build/index.js`), `watch`, `start`
  (`node build/index.js`), `start:http` (`node build/http.js`), `dev`, `clean`.
  Deps: `@modelcontextprotocol/sdk`, `express`, `zod`,
  `@azure/monitor-opentelemetry`. Dev deps: `@types/express`, `@types/node`,
  `typescript` (plus any domain deps).
- `tsconfig.json`, `Dockerfile`, `.dockerignore`, `.gitignore` (ignore `build/`),
  `.env.example`.
- `src/server.ts` — exports `createServer(): McpServer`; register tools with
  `server.registerTool(name, { title, description, inputSchema: { ...zod } }, handler)`.
  Return `{ content: [{ type: "text", text }] }`. Gate external calls behind a
  `checkAuth()`-style readiness check that returns a helpful hint when unconfigured.
- `src/index.ts` — stdio entry (`StdioServerTransport`).
- `src/http.ts` — Streamable HTTP entry: `POST/GET/DELETE /mcp` (session-based
  `StreamableHTTPServerTransport`) and `GET /health` → `{ status: "ok" }`,
  listening on `process.env.PORT ?? 3000`.
- `src/telemetry.ts` — imported first by `http.ts` for App Insights (copy as-is).

The `Dockerfile` builds with `npm install` + `npm run build` and runs
`node build/http.js` on `EXPOSE 3000` as `USER node`.

## 2. Wire it into chat-ui (all required)

- `chat-ui/lib/agents.ts` — add the key to the `ServerKey` union; add it to the
  **General** agent's `servers` array and a matching bullet in its `systemPrompt`.
  Optionally add a dedicated focused agent scoped to just this server.
- `chat-ui/lib/mcp.ts` — add `"<name>": process.env.MCP_<NAME>_URL` to `SERVER_URLS`.
- `chat-ui/lib/tools.ts` — add any **mutating** tools to `SENSITIVE_TOOLS`
  (`toolName: "<name>"`) so approval mode gates them and `/api/tool` routes them.
- `chat-ui/app/api/mcp/health/route.ts` — add
  `{ name: "mcp-<name>", url: process.env.MCP_<NAME>_URL }` to `SERVERS`.
- `chat-ui/.env.example` — add `MCP_<NAME>_URL=http://localhost:3008/mcp`.

## 3. Wire dev tooling & docs

- `scripts/dev-all.mjs` — add `{ name: "<name>", dir: "mcp-<name>", port: 3008, env: {} }`
  to the `SERVERS` array (update the "ports 3001–300N" comment).
- `README.md` — add a row to the component table and rows to the tools reference
  table; add the server's env vars to the configuration reference.
- `claude_desktop_config.json` — optionally map the server over stdio.

## 4. Wire infra (only if deploying to Azure)

In `infra/main.bicep`:

- Add an `@description`'d image param `<name>Image` (and any secret params).
- Add a `module <name> 'container-app.bicep'` block mirroring the `postgres`
  module: `externalIngress: mcpIngressExternal`, `PORT`/App Insights env,
  `dependsOn: [ acrPull, ... ]`.
- Inject `MCP_<NAME>_URL` into the **chat-ui** app's `envVars`
  (`https://${<name>.outputs.fqdn}/mcp` or the internal ingress URL).
- Add the image to the CI/CD build-and-push matrix in `.github/workflows/`.

## 5. Validate

```powershell
cd mcp-<name>; npm install; npx tsc --noEmit   # server type-checks
cd ../chat-ui; npx tsc --noEmit                # client wiring type-checks
cd ..; npm run smoke                           # workspace smoke test
```

Then start it (`cd mcp-<name>; npm run build; npm run start:http` with `PORT=3008`,
or `npm run dev:all` from the root) and confirm its dot goes **online** in the
chat-ui MCP tools panel.

## Checklist

- [ ] `mcp-<name>/` package with `server.ts` + `index.ts` + `http.ts` + telemetry
- [ ] `ServerKey` + General agent (+ optional focused agent) in `agents.ts`
- [ ] `SERVER_URLS` in `mcp.ts`
- [ ] mutating tools in `SENSITIVE_TOOLS` (`tools.ts`)
- [ ] health `SERVERS` entry
- [ ] `MCP_<NAME>_URL` in `chat-ui/.env.example`
- [ ] `dev-all.mjs` SERVERS entry (next free port)
- [ ] README table + tools + config rows
- [ ] Bicep module + chat-ui env + CI image (if deploying)
- [ ] `tsc --noEmit` clean in the package and in chat-ui; online in the health panel
