```html
<div align="center">
  <pre>
   █████╗ ███████╗██╗     ███████╗███╗   ██╗███████╗
  ██╔══██╗╚══███╔╝██║     ██╔════╝████╗  ██║██╔════╝
  ███████║  ███╔╝ ██║     █████╗  ██╔██╗ ██║███████╗
  ██╔══██║ ███╔╝  ██║     ██╔══╝  ██║╚██╗██║╚════██║
  ██║  ██║███████╗███████╗███████╗██║ ╚████║███████║
  ╚═╝  ╚═╝╚══════╝╚══════╝╚══════╝╚═╝  ╚═══╝╚══════╝
              The context compression layer for AI agents
</pre>
</div>
```

# MCP Multi-Server Workspace

**AzLens** is a TypeScript monorepo of seven decoupled [Model Context Protocol](https://modelcontextprotocol.io) servers plus a ChatGPT-style web UI, deployable end-to-end to **Azure Container Apps** with a single GitHub Actions workflow.

| Component                | Type        | Purpose                            | Tools / Role                                                                                                                                                               |
| ------------------------ | ----------- | ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `mcp-local-coder`        | MCP server  | Local file system + code search    | `read_file`, `write_file`, `search_code`, `list_directory`                                                                                                                 |
| `AzLens-mcp`             | MCP server  | Azure ARM / KQL / Wiki             | `query_azure_resource`, `run_kql_query`, `search_wiki`                                                                                                                     |
| `mcp-personal-assistant` | MCP server  | Notes + to-do lists                | `get_daily_notes`, `update_todo_list`                                                                                                                                      |
| `mcp-github`             | MCP server  | GitHub repos / issues / PRs / code | `search_repositories`, `get_repository`, `list_issues`, `get_issue`, `list_pull_requests`, `get_file_contents`, `create_issue`, `add_issue_comment`, `create_pull_request` |
| `mcp-azure-cost`         | MCP server  | Azure cost analysis (FinOps)       | `query_cost`, `get_cost_forecast`, `list_budgets`                                                                                                                          |
| `mcp-knowledge`          | MCP server  | RAG over Azure AI Search           | `search_knowledge`, `get_document`, `ingest_documents`, `create_index`, `delete_documents`                                                                                 |
| `mcp-postgres`           | MCP server  | Read-only PostgreSQL queries       | `list_tables`, `describe_table`, `query`                                                                                                                                   |
| `chat-ui`                | Next.js app | ChatGPT-style front end            | Multi-provider LLM + MCP client over all seven servers                                                                                                                     |

Each MCP server ships **two transports** from a single codebase:

- **stdio** (`build/index.js`) — for locally-spawned clients (Claude Desktop, VS Code).
- **Streamable HTTP** (`build/http.js`) — for remote hosting on Azure Container Apps.

## Chat UI

A modern, claude.ai-style front end with a collapsible sidebar, **New chat**, search, and multiple conversations you can switch between (persisted in the browser, with optional server-side sync to Azure Cosmos DB). Each conversation streams responses from your chosen model and can call the MCP tools.

Highlights: **multi-provider models** (Azure OpenAI / OpenAI / Anthropic / local LM Studio-style servers) — cloud model lists are **auto-discovered** from each provider's `/models` API (with a curated fallback) — plus an **Auto router** that sends simple prompts to a cheap model and complex ones to a powerful model; a per-turn **usage & cost** footer (prices overridable via `PRICES_JSON`); switchable **agents** (General / Code / Azure / Personal Assistant / GitHub / FinOps / Research / Data), each scoped to the right MCP servers; **Projects** that group related chats with shared instructions and uploaded grounding files; an **Artifacts** panel that collects the code, docs, and tables an assistant produces (with preview, copy-all, and zip download); **per-conversation instructions** that refine the agent prompt; **syntax-highlighted code blocks** with a copy button; **tool approval** for mutating tools (including GitHub `create_issue` / `create_pull_request` and knowledge-base `ingest_documents`); **stop / regenerate / copy / edit-and-resend**; **dark mode**; an **MCP tools health panel** (live online/offline dots); chat **rename** + date grouping; markdown rendering; file/image attachments; and a **⌘K command palette**.

![AzLens chat UI in dark mode: sidebar with a pinned chat and date-grouped chats, an MCP tools health panel, a model picker in the top bar, and a conversation with rendered markdown](docs/chat-ui-hero.png)

The **⌘K command palette** — jump between chats or run actions:

![AzLens command palette opened over the chat, listing actions and chats](docs/chat-ui-palette.png)

Collapsing the sidebar leaves a slim **icon rail** (new chat, search, theme):

![AzLens sidebar collapsed to a slim icon rail](docs/chat-ui-rail.png)

**Projects** group related chats with shared instructions and grounding files (reorder by drag or arrows, ingest to the knowledge base):

![AzLens Projects modal listing projects with reorder, instructions, files, and knowledge-base actions](docs/chat-ui-projects.png)

The **Artifacts** panel collects the code, docs, and tables an assistant produces — with preview, copy-all, and zip download:

![AzLens Artifacts panel showing a syntax-highlighted code artifact with copy and download actions](docs/chat-ui-artifacts.png)

<details>
<summary>Light mode</summary>

![AzLens chat UI in light mode with the multi-chat sidebar](docs/chat-ui-multichat.png)

</details>

---

## Table of contents

- [Architecture](#architecture)
- [Repository layout](#repository-layout)
- [Prerequisites](#prerequisites)
- [Quick start (local)](#quick-start-local)
- [Running & testing locally (step by step)](#running--testing-locally-step-by-step)
- [Configuration reference](#configuration-reference)
- [Deploy to Azure](#deploy-to-azure)
  - [One-time setup](#step-1--one-time-azure-setup-oidc)
  - [chat-ui secrets](#step-2--chat-ui-secrets-azure-openai--entra)
  - [Run the deployment](#step-3--run-the-deployment)
  - [Post-deploy configuration](#step-4--post-deploy-configuration)
- [Manual deploy](#manual-deploy-without-github-actions)
- [Tools reference](#tools-reference)
- [Chat UI functionality](#chat-ui-functionality)
- [How it works](#how-it-works)
- [Tooling & quality](#tooling--quality)
- [Operations & hardening](#operations--hardening)
- [Troubleshooting](#troubleshooting)

---

## Architecture

### Deployment topology

Everything runs in one Container Apps environment. A single user-assigned managed identity pulls images from ACR; `AzLens-mcp` also uses it to query Azure. Only `chat-ui` is exposed to users behind Entra Easy Auth.

![Deployment topology: chat-ui and three MCP servers in one Container Apps environment, with ACR, managed identity, Log Analytics, Azure OpenAI, Entra ID, and Azure Resource Manager](docs/arch-topology.png)

### Request flow (a single chat turn)

![Sequence diagram: user prompt goes to chat-ui, which calls Azure OpenAI, which requests an MCP tool call, chat-ui calls the MCP server over /mcp, and the streamed answer returns to the user](docs/arch-flow.png)

### CI/CD flow

![CI/CD flow: push to main or run workflow, OIDC login, create resource group, deploy infra, build images, deploy apps, print endpoints](docs/arch-cicd.png)

### Identity & authentication

Four distinct mechanisms: Easy Auth (users → chat-ui), API keys (chat-ui → model), `DefaultAzureCredential` + managed identity (AzLens → Azure), and OIDC federation (GitHub → Azure).

![Identity diagram showing Easy Auth, provider API keys, managed identity with Reader/Log Analytics Reader/AcrPull, and GitHub OIDC federation](docs/arch-identity.png)

### Network & security boundaries

Only `chat-ui` is publicly exposed (behind Easy Auth); it fans out to the MCP servers and egresses to Azure OpenAI, ARM/Log Analytics, and Microsoft Learn.

![Network boundary diagram: users reach chat-ui over the internet; chat-ui calls the three MCP servers; egress to Azure OpenAI, ARM/Log Analytics, and Microsoft Learn; ACR image pull via managed identity](docs/arch-network.png)

### Component / module map

Each MCP server's logic lives once in `server.ts` and is reused by the stdio and HTTP entry points; chat-ui's API routes act as the MCP client.

![Component diagram of the monorepo: each MCP server's server.ts feeds index.ts and http.ts; AzLens has wiki.ts; chat-ui components call api routes which are MCP clients](docs/arch-components.png)

### Chat-turn lifecycle

![State diagram: Idle to Submitted to Streaming, looping through ToolCall, then Done and back to Idle](docs/arch-chatturn.png)

### `search_wiki` sources

![Diagram: search_wiki calls getWikiSources which fans out to Microsoft Learn, an optional Azure DevOps wiki, and custom sources, merging results](docs/arch-wiki.png)

---

## Repository layout

```text
mcp-workspace/
├─ .github/workflows/deploy.yml     # provision + build + deploy pipeline
├─ infra/
│  ├─ main.bicep                    # environment, ACR, identity, 3 MCP apps + chat-ui
│  ├─ container-app.bicep           # reusable MCP container app module
│  └─ main.parameters.json          # default parameter values
├─ mcp-local-coder/                 # MCP server (files + code search)
│  ├─ src/{server,index,http}.ts    # factory / stdio / HTTP entry points
│  ├─ Dockerfile
│  └─ package.json
├─ AzLens-mcp/                      # MCP server (Azure ARM / KQL / Wiki)
├─ mcp-personal-assistant/          # MCP server (notes + to-do)
├─ chat-ui/                         # Next.js ChatGPT-style front end
│  ├─ app/{page,layout}.tsx
│  ├─ app/api/chat/route.ts         # Azure OpenAI + tool orchestration
│  ├─ lib/mcp.ts                    # aggregates MCP tools from all 3 servers
│  └─ Dockerfile
└─ claude_desktop_config.json       # local stdio client config
```

Each MCP server is fully isolated — its own `package.json`, dependencies, and build. Within a server, tool logic lives once in `src/server.ts` (`createServer()`), reused by both `index.ts` (stdio) and `http.ts` (HTTP).

---

## Prerequisites

| For                  | You need                                                                               |
| -------------------- | -------------------------------------------------------------------------------------- |
| Local development    | Node.js 18+ (20/22 LTS recommended), npm                                               |
| Deployment           | Azure subscription, [Azure CLI](https://learn.microsoft.com/cli/azure/), a GitHub repo |
| chat-ui              | An Azure OpenAI resource with a chat model deployment (e.g. `gpt-4o`)                  |
| Easy Auth (optional) | Permission to create a Microsoft Entra app registration                                |

---

## Quick start (local)

### 1. Build and run an MCP server (stdio)

```bash
cd mcp-local-coder
npm install
npm run build
npm start            # stdio transport — for Claude Desktop / VS Code
```

To expose it over HTTP instead:

```bash
npm run start:http   # Streamable HTTP on http://localhost:3000/mcp
```

### 2. Use the servers from a local MCP client

Point your client at [claude_desktop_config.json](claude_desktop_config.json) (replace the placeholder absolute paths). It maps all three servers over stdio.

### 3. Run the chat UI locally

**Fastest — one command** (builds each server if needed, then starts all six MCP servers on :3001–:3006 and the UI on :3000 with prefixed output; Ctrl+C stops everything):

```bash
cd chat-ui && cp .env.example .env.local   # once — fill in a model key
cd .. && npm run dev:all
```

Or start each process in its own terminal for finer control:

```bash
# terminal 1
cd mcp-local-coder        && PORT=3001 npm run start:http
# terminal 2
cd AzLens-mcp             && PORT=3002 npm run start:http
# terminal 3
cd mcp-personal-assistant && PORT=3003 npm run start:http
# terminal 4 (GitHub — set GITHUB_TOKEN to enable private repos + write tools)
cd mcp-github             && PORT=3004 npm run start:http
# terminal 5 (Azure cost — needs az login + Cost Management Reader)
cd mcp-azure-cost         && PORT=3005 npm run start:http
# terminal 6 (Knowledge/RAG — needs an Azure AI Search endpoint + index)
cd mcp-knowledge          && PORT=3006 npm run start:http
# terminal 7 (Postgres — needs DATABASE_URL for live queries)
cd mcp-postgres           && PORT=3007 npm run start:http

# terminal 8
cd chat-ui
cp .env.example .env.local   # fill in Azure OpenAI + the MCP_*_URL values above
npm install
npm run dev                  # http://localhost:3000
```

---

## Running & testing locally (step by step)

These steps assume **Node.js 18+** is installed. Ordered fastest → most involved.

### Step 1 — Automated smoke test (fastest)

Spawns each server over stdio, lists its tools, and runs safe round-trips. Builds each server on first run.

```bash
npm install          # once, at the repo root
npm run smoke
```

Expected: `Smoke test PASSED.` (all checks pass). Use `SKIP_BUILD=1 npm run smoke` to skip rebuilds.

The chat-ui also has **Vitest** unit tests for the complexity router, cost estimator, tool-approval gating, and the knowledge-base ingestion chunking:

```bash
cd chat-ui
npm install && npm test
```

These run automatically in CI alongside each project's build.

The chat-ui also ships **Playwright** end-to-end tests for UI flows that need no model key — greeting, new chat, command palette, per-conversation instructions, composer mode chips, the Artifacts panel, creating/opening a Project, and knowledge-base ingestion (with a mocked tool API):

```bash
cd chat-ui
npx playwright install chromium   # once
npm run e2e
```

The E2E suite runs as its own CI job.

### Step 2 — Interactive tool testing (MCP Inspector)

The [MCP Inspector](https://github.com/modelcontextprotocol/inspector) is a browser UI to call tools by hand — no LLM required. Best for exploring a single server.

```bash
cd mcp-local-coder
npm install && npm run build
npx @modelcontextprotocol/inspector node build/index.js
```

Open the printed `http://localhost:6274` URL, click **Connect** → **List Tools**, and invoke `read_file` / `write_file` / `search_code`. Repeat for the other servers:

- `mcp-personal-assistant` — works offline; try `update_todo_list` then `get_daily_notes`.
- `AzLens-mcp` — `search_wiki` works offline; `query_azure_resource` / `run_kql_query` need `az login` and `AZURE_SUBSCRIPTION_ID` set.

Press Ctrl+C to stop.

### Step 3 — HTTP transport (what Azure runs)

```bash
cd mcp-local-coder
PORT=3001 npm run start:http
# in another terminal:
curl http://localhost:3001/health     # -> {"status":"ok"}
```

You can also point the Inspector at `http://localhost:3001/mcp` using the **Streamable HTTP** transport.

### Step 4 — Full end-to-end (chat UI)

Requires an **Azure OpenAI** resource + chat model deployment. Run the seven servers on distinct ports, then the UI:

```bash
# seven terminals
cd mcp-local-coder        && PORT=3001 npm run start:http
cd AzLens-mcp             && PORT=3002 npm run start:http
cd mcp-personal-assistant && PORT=3003 npm run start:http
cd mcp-github             && PORT=3004 npm run start:http
cd mcp-azure-cost         && PORT=3005 npm run start:http
cd mcp-knowledge          && PORT=3006 npm run start:http
cd mcp-postgres           && PORT=3007 npm run start:http

# and the UI
cd chat-ui
cp .env.example .env.local   # set AZURE_OPENAI_* and MCP_*_URL to :3001..:3007
npm install
npm run dev                  # http://localhost:3000
```

Open http://localhost:3000 and try: _"read the file package.json"_, _"add 'ship v1' to my to-do list"_. Tool-call badges appear when a server is used. Easy Auth is an Azure-only feature, so the local UI is open — expected.

### Step 5 — Use from a local MCP client (stdio)

Point Claude Desktop / VS Code at [claude_desktop_config.json](claude_desktop_config.json), replacing the placeholder paths with your absolute `build/index.js` paths, then restart the client.

> **Recommended order:** Step 1 to confirm health, Step 2 to poke individual tools, then Step 4 once you have Azure OpenAI details.

---

## Configuration reference

All configuration is via environment variables. Locally use `.env` / `.env.local`; in Azure the Bicep template injects these. Secrets are stored as Container Apps secrets by default, or in **Azure Key Vault** (referenced through the shared managed identity) when the `useKeyVault` deployment parameter is `true`. The `mcp-github` token is always injected as a secret — never a plaintext environment variable.

### `mcp-local-coder`

| Variable         | Default             | Description                                            |
| ---------------- | ------------------- | ------------------------------------------------------ |
| `WORKSPACE_ROOT` | current working dir | Sandbox root; all file paths are constrained inside it |
| `PORT`           | `3000`              | HTTP port (HTTP transport only)                        |

### `AzLens-mcp`

| Variable                     | Default | Description                                                       |
| ---------------------------- | ------- | ----------------------------------------------------------------- |
| `AZURE_SUBSCRIPTION_ID`      | —       | Subscription queried by `query_azure_resource`                    |
| `LOG_ANALYTICS_WORKSPACE_ID` | —       | Default workspace for `run_kql_query`                             |
| `AZURE_CLIENT_ID`            | —       | Set by Bicep to the managed identity for `DefaultAzureCredential` |
| `PORT`                       | `3000`  | HTTP port                                                         |

Auth uses `DefaultAzureCredential`: `az login` locally, managed identity in Azure. No secrets are stored in code.

### `mcp-personal-assistant`

| Variable     | Default       | Description                                           |
| ------------ | ------------- | ----------------------------------------------------- |
| `NOTES_ROOT` | `~/mcp-notes` | Directory holding `YYYY-MM-DD.md` notes and `todo.md` |
| `PORT`       | `3000`        | HTTP port                                             |

### `mcp-github`

| Variable       | Default | Description                                                                                                                                                                                                   |
| -------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GITHUB_TOKEN` | —       | Optional for reads (raises the rate limit to 5000/h and allows private repos). **Required** for the write tools (`create_issue`, `add_issue_comment`, `create_pull_request`) — use a token with `repo` scope. |
| `PORT`         | `3000`  | HTTP port                                                                                                                                                                                                     |

### `mcp-azure-cost`

| Variable                | Default | Description                                               |
| ----------------------- | ------- | --------------------------------------------------------- |
| `AZURE_SUBSCRIPTION_ID` | —       | Subscription to analyze. Required for any live cost call. |
| `PORT`                  | `3000`  | HTTP port                                                 |

Auth uses `DefaultAzureCredential` (`az login` locally, managed identity in Azure). The identity needs the **Cost Management Reader** role on the subscription.

### `mcp-knowledge`

| Variable                       | Default   | Description                                                                                                                                                                                                                           |
| ------------------------------ | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AZURE_SEARCH_ENDPOINT`        | —         | Azure AI Search service endpoint, e.g. `https://<svc>.search.windows.net`.                                                                                                                                                            |
| `AZURE_SEARCH_INDEX`           | —         | Index name to query.                                                                                                                                                                                                                  |
| `AZURE_SEARCH_API_KEY`         | —         | Optional key; leave empty to use the managed identity. Reading needs **Search Index Data Reader**; ingesting/deleting needs **Search Index Data Contributor**; `create_index` needs **Search Service Contributor** (or an admin key). |
| `AZURE_SEARCH_KEY_FIELD`       | `id`      | Field holding the document key (used by ingest/delete).                                                                                                                                                                               |
| `AZURE_SEARCH_CONTENT_FIELD`   | `content` | Field holding the passage text.                                                                                                                                                                                                       |
| `AZURE_SEARCH_TITLE_FIELD`     | `title`   | Field holding the document title.                                                                                                                                                                                                     |
| `AZURE_SEARCH_SEMANTIC_CONFIG` | —         | Optional semantic configuration name to enable semantic ranking.                                                                                                                                                                      |
| `PORT`                         | `3000`    | HTTP port                                                                                                                                                                                                                             |

### `mcp-postgres`

| Variable                  | Default | Description                                                                      |
| ------------------------- | ------- | -------------------------------------------------------------------------------- |
| `DATABASE_URL`            | —       | PostgreSQL connection string, e.g. `postgresql://user:pass@host:5432/db`.        |
| `PGSSL`                   | on      | Set to `disable` for a local server without TLS (Azure PostgreSQL requires SSL). |
| `PG_STATEMENT_TIMEOUT_MS` | `15000` | Per-query statement timeout in milliseconds.                                     |
| `PORT`                    | `3000`  | HTTP port                                                                        |

Queries run inside a **READ ONLY** transaction (only `SELECT`/`WITH` reach the DB), so writes are rejected by PostgreSQL itself.

### `chat-ui`

| Variable                               | Description                                                                                                                                                                        |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `CHAT_PROVIDER`                        | Optional. Force a provider: `azure` / `openai` / `anthropic` / `local`. Otherwise auto-detected from whichever key is set.                                                         |
| `AZURE_OPENAI_RESOURCE_NAME`           | Azure OpenAI resource name (not the full URL)                                                                                                                                      |
| `AZURE_OPENAI_DEPLOYMENT`              | Chat model deployment name, e.g. `gpt-4o`                                                                                                                                          |
| `AZURE_OPENAI_API_VERSION`             | API version, e.g. `2024-10-21`                                                                                                                                                     |
| `AZURE_OPENAI_API_KEY`                 | API key (a Container Apps secret in Azure)                                                                                                                                         |
| `OPENAI_API_KEY`                       | Optional. Enables the OpenAI provider; its model list is auto-discovered from `/v1/models` (with a curated fallback). `OPENAI_MODEL` overrides the default.                        |
| `ANTHROPIC_API_KEY`                    | Optional. Enables the Anthropic provider; its model list is auto-discovered from `/v1/models` (with a curated fallback). `ANTHROPIC_MODEL` overrides the default.                  |
| `LOCAL_OPENAI_BASE_URL`                | Optional OpenAI-compatible endpoint (LM Studio / Ollama / vLLM), e.g. `http://localhost:1234/v1`. Enables a **Local** provider whose models are auto-discovered from `/v1/models`. |
| `LOCAL_MODEL`                          | Optional fallback local model id when `/v1/models` can't be reached; `LOCAL_OPENAI_API_KEY` / `LOCAL_LABEL` are also optional.                                                     |
| `AUTO_SIMPLE` / `AUTO_COMPLEX`         | Optional overrides for the Auto router as `provider:model` (e.g. `anthropic:claude-3-5-sonnet-latest`).                                                                            |
| `PRICES_JSON`                          | Optional. JSON map of model-id substring → `{ "input": n, "output": n }` (USD per 1M tokens) to override/add cost-estimate prices without code changes.                            |
| `RATE_LIMIT_PER_MIN`                   | Optional. Max `/api/chat` requests per caller (Easy Auth user id or IP) per minute. `0` (default) disables it.                                                                     |
| `REDIS_URL`                            | Optional. Redis connection string for **cluster-wide** rate limiting across replicas (e.g. Azure Cache for Redis). Without it the limiter is per-replica in-memory.                |
| `MCP_LOCAL_CODER_URL`                  | `mcp-local-coder` `/mcp` endpoint                                                                                                                                                  |
| `MCP_AZLENS_URL`                       | `AzLens-mcp` `/mcp` endpoint                                                                                                                                                       |
| `MCP_PERSONAL_ASSISTANT_URL`           | `mcp-personal-assistant` `/mcp` endpoint                                                                                                                                           |
| `MCP_GITHUB_URL`                       | `mcp-github` `/mcp` endpoint                                                                                                                                                       |
| `MCP_AZURE_COST_URL`                   | `mcp-azure-cost` `/mcp` endpoint                                                                                                                                                   |
| `MCP_KNOWLEDGE_URL`                    | `mcp-knowledge` `/mcp` endpoint                                                                                                                                                    |
| `MCP_POSTGRES_URL`                     | `mcp-postgres` `/mcp` endpoint                                                                                                                                                     |
| `COSMOS_ENDPOINT`                      | Optional. Azure Cosmos DB account endpoint (AAD/managed-identity auth) to persist conversations server-side. `COSMOS_CONNECTION_STRING` is an alternative for local dev.           |
| `COSMOS_DATABASE` / `COSMOS_CONTAINER` | Optional. Cosmos database/container names (default `azlens` / `conversations`).                                                                                                    |

> Tool-approval mode is a per-browser UI setting (the **Approvals** toggle), not an environment variable.

---

## Deploy to Azure

The pipeline deploys **automatically on every push to `main`**, and can also be run manually — open the **Actions** tab, select **Provision and Deploy MCP Servers**, and click **Run workflow** (manual runs let you override the resource group, region, and name prefix):

**[▶ Run the deploy workflow](../../actions/workflows/deploy.yml)** _(replace with your repo URL)_

Either trigger provisions the infrastructure, builds & pushes all seven container images to ACR, deploys the apps, and prints each endpoint in the run summary.

> A portal "Deploy to Azure" button is intentionally not used: these are container images that must be built and pushed to a registry, which the pipeline handles end-to-end.

### Step 1 — One-time Azure setup (OIDC)

The workflow logs in with **OIDC federation** — no client secrets stored in GitHub. Run once, replacing `<subscription-id>` and `<owner>/<repo>`:

```bash
# 1. App registration for the pipeline
appId=$(az ad app create --display-name "mcp-deploy" --query appId -o tsv)
az ad sp create --id "$appId"

# 2. Grant Owner on the subscription (Owner is required because the Bicep
#    creates an AcrPull role assignment; Contributor cannot do that).
az role assignment create --assignee "$appId" --role "Owner" \
  --scope "/subscriptions/<subscription-id>"

# 3. Federated credential for the main branch
az ad app federated-credential create --id "$appId" --parameters '{
  "name": "github-main",
  "issuer": "https://token.actions.githubusercontent.com",
  "subject": "repo:<owner>/<repo>:ref:refs/heads/main",
  "audiences": ["api://AzureADTokenExchange"]
}'

echo "AZURE_CLIENT_ID = $appId"
```

Add these **repository secrets** (Settings → Secrets and variables → Actions):

| Secret                  | Value                                     |
| ----------------------- | ----------------------------------------- |
| `AZURE_CLIENT_ID`       | the `appId` printed above                 |
| `AZURE_TENANT_ID`       | `az account show --query tenantId -o tsv` |
| `AZURE_SUBSCRIPTION_ID` | your subscription ID                      |

> If you run the workflow from a branch other than `main`, add a matching federated credential (`...:ref:refs/heads/<branch>`).

### Step 2 — chat-ui secrets (Azure OpenAI + Entra)

Add these repository secrets so the pipeline can configure the front end. Leave the `ENTRA_*` pair empty to deploy chat-ui **without** sign-in.

| Secret                       | Value                                       |
| ---------------------------- | ------------------------------------------- |
| `AZURE_OPENAI_RESOURCE_NAME` | Azure OpenAI resource name (not the URL)    |
| `AZURE_OPENAI_DEPLOYMENT`    | chat model deployment, e.g. `gpt-4o`        |
| `AZURE_OPENAI_API_KEY`       | key from the Azure OpenAI resource          |
| `ENTRA_CLIENT_ID`            | Entra app (client) ID that protects chat-ui |
| `ENTRA_CLIENT_SECRET`        | client secret for that Entra app            |

Create the Entra app that fronts chat-ui **after** the first deploy (so you know the chat-ui URL):

```bash
chatUrl=<chatUiUrl from deployment outputs>   # https://chat-ui.<region>.azurecontainerapps.io
appId=$(az ad app create --display-name "mcp-chat-ui" \
  --web-redirect-uris "$chatUrl/.auth/login/aad/callback" \
  --query appId -o tsv)
secret=$(az ad app credential reset --id "$appId" --query password -o tsv)
echo "ENTRA_CLIENT_ID = $appId"
echo "ENTRA_CLIENT_SECRET = $secret"
```

Add the two values as secrets and re-run the workflow to turn on Easy Auth.

### Step 3 — Run the deployment

Push to `main` (or click **Run workflow**). The pipeline:

1. logs in via OIDC,
2. creates the resource group,
3. deploys `infra/main.bicep` (`mcp-infra`) to create ACR + environment + identity,
4. builds and pushes the seven images with `az acr build`,
5. redeploys (`mcp-apps`) with the real image tags,
6. prints the `chat-ui`, `mcp-local-coder`, `AzLens-mcp`, and `mcp-personal-assistant` URLs in the run summary.

### Step 4 — Post-deploy configuration

**AzLens permissions** — grant the managed identity read access to what it queries:

```bash
clientId=<managedIdentityClientId from deployment outputs>
az role assignment create --assignee "$clientId" --role "Reader" \
  --scope "/subscriptions/<subscription-id>"
az role assignment create --assignee "$clientId" --role "Log Analytics Reader" \
  --scope "<log-analytics-workspace-resource-id>"
```

**Easy Auth** — once `ENTRA_CLIENT_ID` / `ENTRA_CLIENT_SECRET` are set and the workflow re-runs, visiting the chat-ui URL redirects to Microsoft sign-in.

**Key Vault (default on)** — `useKeyVault` defaults to `true`, so the Azure OpenAI key, GitHub token, Postgres connection string, Search key, and Entra client secret are stored in a Key Vault instead of inline Container Apps secrets. The template creates the vault (RBAC-authorized), grants the shared managed identity the **Key Vault Secrets User** role, writes the provided secret values, and switches each app to reference them by `keyVaultUrl`. Set `-p useKeyVault=false` to inline secrets instead (not recommended).

```bash
az deployment group create -g rg-mcp -f infra/main.bicep \
  -p infra/main.parameters.json -p useKeyVault=false
```

**Conversation persistence (optional)** — deploy with `deployCosmos=true` to provision an **Azure Cosmos DB** account (AAD-only; local auth disabled) and persist chat history server-side. The template creates the `azlens`/`conversations` database + container, grants the managed identity the **Cosmos DB Built-in Data Contributor** data-plane role, and injects `COSMOS_ENDPOINT` into chat-ui. Conversations are mirrored from the browser (write-through) and hydrated on a fresh device; when `deployCosmos` is off, chat-ui uses `localStorage` only.

```bash
az deployment group create -g rg-mcp -f infra/main.bicep \
  -p infra/main.parameters.json -p deployCosmos=true
```

**Rate limiting (optional)** — set `rateLimitPerMin` to cap `/api/chat` requests per caller, and `deployRedis=true` to provision an **Azure Cache for Redis** so the limit is enforced **cluster-wide** across chat-ui replicas (the template injects `REDIS_URL` as a secret). Without Redis the limiter is per-replica in-memory; if Redis is configured but unreachable it fails open to in-memory.

```bash
az deployment group create -g rg-mcp -f infra/main.bicep \
  -p infra/main.parameters.json -p deployRedis=true -p rateLimitPerMin=30
```

---

## Manual deploy (without GitHub Actions)

```bash
az group create -n rg-mcp -l eastus
az deployment group create -g rg-mcp -f infra/main.bicep -p infra/main.parameters.json

# build & push images, then redeploy with the real tags
acr=$(az deployment group show -g rg-mcp -n main --query properties.outputs.acrName.value -o tsv)
for app in mcp-local-coder:mcp-local-coder azlens-mcp:AzLens-mcp \
           mcp-personal-assistant:mcp-personal-assistant chat-ui:chat-ui; do
  img="${app%%:*}"; dir="${app##*:}"
  az acr build -r "$acr" -t "$img:latest" "./$dir"
done
```

Then re-run `az deployment group create` passing the `*Image` parameters (see the workflow for the exact list).

---

## Tools reference

| Server                 | Tool                   | Parameters                                                  | Description                                                                       |
| ---------------------- | ---------------------- | ----------------------------------------------------------- | --------------------------------------------------------------------------------- |
| mcp-local-coder        | `read_file`            | `path`                                                      | Read a file inside `WORKSPACE_ROOT`                                               |
| mcp-local-coder        | `write_file`           | `path`, `content`                                           | Create/overwrite a file (dirs auto-created)                                       |
| mcp-local-coder        | `search_code`          | `query`                                                     | Recursive case-insensitive text search                                            |
| mcp-local-coder        | `list_directory`       | `path?`                                                     | List files/folders in a workspace directory                                       |
| AzLens-mcp             | `query_azure_resource` | `resourceId`                                                | Fetch an ARM resource by ID (returns a clear hint if not authenticated)           |
| AzLens-mcp             | `run_kql_query`        | `workspaceId?`, `query`                                     | Run a KQL query against Log Analytics (returns a clear hint if not authenticated) |
| AzLens-mcp             | `search_wiki`          | `query`                                                     | Search docs — backed by Microsoft Learn; extensible to internal wikis             |
| mcp-personal-assistant | `get_daily_notes`      | `date` (YYYY-MM-DD)                                         | Read that day's markdown notes                                                    |
| mcp-personal-assistant | `update_todo_list`     | `task`, `status`                                            | Add/update a task (`todo`/`in-progress`/`done`)                                   |
| mcp-github             | `search_repositories`  | `query`, `limit?`                                           | Search public repositories with GitHub qualifiers                                 |
| mcp-github             | `get_repository`       | `owner`, `repo`                                             | Repository details (stars, language, issues)                                      |
| mcp-github             | `list_issues`          | `owner`, `repo`, `state?`                                   | List issues (excludes PRs)                                                        |
| mcp-github             | `get_issue`            | `owner`, `repo`, `number`                                   | Fetch a single issue with its body                                                |
| mcp-github             | `list_pull_requests`   | `owner`, `repo`, `state?`                                   | List pull requests                                                                |
| mcp-github             | `get_file_contents`    | `owner`, `repo`, `path`, `ref?`                             | Read a text file from a repo                                                      |
| mcp-github             | `create_issue`         | `owner`, `repo`, `title`, `body?`, `labels?`                | Open a new issue (write — needs `GITHUB_TOKEN` + approval)                        |
| mcp-github             | `add_issue_comment`    | `owner`, `repo`, `number`, `body`                           | Comment on an issue/PR (write — needs `GITHUB_TOKEN` + approval)                  |
| mcp-github             | `create_pull_request`  | `owner`, `repo`, `title`, `head`, `base`, `body?`, `draft?` | Open a PR (write — needs `GITHUB_TOKEN` + approval)                               |
| mcp-azure-cost         | `query_cost`           | `timeframe`, `groupBy?`, `from?`, `to?`, `limit?`           | Actual Azure spend, optionally grouped by a dimension                             |
| mcp-azure-cost         | `get_cost_forecast`    | `timeframe`, `from?`, `to?`                                 | Forecast Azure spend for a period                                                 |
| mcp-azure-cost         | `list_budgets`         | —                                                           | Budgets with limit, period, and current spend                                     |
| mcp-knowledge          | `search_knowledge`     | `query`, `top?`                                             | Semantic/keyword search over an Azure AI Search index (cited passages)            |
| mcp-knowledge          | `get_document`         | `key`                                                       | Fetch one document from the index by key                                          |
| mcp-knowledge          | `ingest_documents`     | `documents[]`                                               | Merge-or-upload documents (id, title, content, source) into the index             |
| mcp-knowledge          | `create_index`         | `force?`                                                    | Create the search index with a default schema (first-time setup)                  |
| mcp-knowledge          | `delete_documents`     | `keys[]`                                                    | Delete documents from the index by key                                            |
| mcp-postgres           | `list_tables`          | `schema?`                                                   | List tables/views in a schema                                                     |
| mcp-postgres           | `describe_table`       | `table`, `schema?`                                          | Columns and types of a table                                                      |
| mcp-postgres           | `query`                | `sql`, `limit?`                                             | Run a read-only SELECT/WITH query (READ ONLY txn + timeout)                       |

> `write_file`, `update_todo_list`, and the GitHub write tools (`create_issue`, `add_issue_comment`, `create_pull_request`) mutate state and are gated by **tool-approval mode** (on by default) — the model must get the user's confirmation before they run. Adjust the list in [chat-ui/lib/tools.ts](chat-ui/lib/tools.ts).

### MCP resources & prompts

Beyond tools, each server also exposes MCP **resources** (readable context) and **prompts** (reusable templates), surfaced in the chat-ui sidebar under **Prompts & resources**:

| Server                 | Prompts                          | Resources                                     |
| ---------------------- | -------------------------------- | --------------------------------------------- |
| mcp-local-coder        | `review-file`, `explain-code`    | `coder://workspace`                           |
| AzLens-mcp             | `diagnose-resource`, `write-kql` | `azlens://context`                            |
| mcp-personal-assistant | `plan-my-day`                    | `assistant://todo`, `assistant://notes/today` |
| mcp-github             | `triage-issue`, `summarize-repo` | `github://rate-limit`                         |
| mcp-azure-cost         | `cost-review`                    | `azurecost://context`                         |
| mcp-knowledge          | `rag-answer`                     | `knowledge://context`                         |
| mcp-postgres           | `explore-schema`                 | `postgres://context`                          |

Clicking a prompt drafts its template into the composer (asking for any arguments); clicking a resource pulls its current content in as context.

---

## Chat UI functionality

The `chat-ui` front end is a full-featured, claude.ai-style client.

**Conversations**

- Multiple chats, persisted in the browser (localStorage) and switchable from the sidebar, with **optional Azure Cosmos DB** sync (write-through + fresh-device hydration) when `COSMOS_ENDPOINT` is set. Each chat remembers **its own agent and model** selection.
- **Per-conversation instructions** — an editable panel (topbar → **Instructions**) whose text is appended to the agent's system prompt for that chat only, and synced to Cosmos when enabled.
- **Syntax-highlighted code blocks** (highlight.js via rehype) with a hover **Copy** button; assistant replies render GitHub-flavoured markdown.
- Auto-generated titles from the first message; **double-click a chat to rename** it.
- **Pin** chats to a dedicated section; the rest are grouped by **Today / Yesterday / Previous 7 days / Older**.
- Delete individual chats or **Clear all chats**.
- **Export** a chat to Markdown or all chats to JSON, and **Import** chats back — from the command palette.

**Projects (chat grouping + grounding)**

- Group related chats into **Projects** (claude.ai-style) from the sidebar **Projects** panel or the **Manage** modal. Assign a chat by **dragging** it onto a project; opening a project filters the sidebar to its chats.
- **Shared instructions** per project are prepended to every chat in it; chats that inherit them show a small indicator next to their title.
- **Reorder** projects by drag-and-drop or the ↑/↓ buttons (order persists locally and to Cosmos).
- **Grounding files** — upload text files to a project; their contents are injected as reference context into every chat in that project.
- **Knowledge-base ingestion** — one-click **Create index**, **Ingest to knowledge base** (chunks the project's files into passages and merges them into Azure AI Search via `mcp-knowledge`), and **Remove from index**. Removing a file or deleting a project also purges its passages from the index.

**Artifacts**

- A right-side **Artifacts** panel collects the code, documents, and tables the assistant produced in the active chat, updating live as messages stream in.
- **Syntax-highlighted** code (highlight.js), a **Preview** toggle for HTML (sandboxed iframe), SVG, Markdown, and a collapsible **JSON tree**.
- **Copy** or **Download** any artifact, **Copy all**, or **Download all** as a zip.

**Composing & responses**

- Streaming responses rendered as **Markdown** (headings, lists, tables, code blocks, links) via `react-markdown` + GFM.
- **File & image attachments** via the ＋ button (sent as `experimental_attachments`; images are understood by vision-capable models such as `gpt-4o`).
- Auto-growing composer — **Enter** sends, **Shift+Enter** inserts a newline.
- **Stop** a streaming response, **Regenerate** the last answer, **Copy** any reply, and **Edit & resend** a previous user message (which trims the turns after it).
- A small footer under each answer shows the agent, model, routed tier, and **token usage with an estimated cost** — using the provider's reported token counts when available, or a labelled `~approx` estimate (characters ÷ 4) otherwise.
- Tool calls render as **collapsible cards** showing the tool name, arguments, and result (click to expand).

**Models & routing**

- A **model picker** in the top bar lists only the providers configured on the server (Azure OpenAI / OpenAI / Anthropic / Local). The choice persists and is sent per message. A local OpenAI-compatible server (LM Studio, Ollama, vLLM) appears as **Local** when `LOCAL_OPENAI_BASE_URL` is set, with its loaded models discovered automatically.
- **Auto (route by complexity)** — the default option. A zero-cost heuristic scores each prompt and routes **simple** requests to a cheap/fast model and **complex** ones (code, multi-step reasoning, long or multi-part prompts) to the most capable model available. With a local model configured, simple prompts prefer the free **Local** model and complex prompts go to the best cloud model. The chosen agent, model, and tier are shown as a small badge above each answer. Override the picks with `AUTO_SIMPLE` / `AUTO_COMPLEX` (`provider:model`).
- **Routing resilience** — if Auto routes to a local server that is currently offline, it automatically falls back to the next available provider instead of failing the turn (the badge shows `· local offline`).

**Tool approval (human-in-the-loop)**

- The **Approvals** toggle in the top bar (on by default) requires explicit confirmation before **mutating** tools run — `write_file`, `update_todo_list`, the GitHub writers (`create_issue`, `add_issue_comment`, `create_pull_request`), and the knowledge-base writers (`ingest_documents`, `create_index`, `delete_documents`). When the model calls one, its `execute` is withheld server-side and the UI shows **Approve / Deny**; approving runs it via `POST /api/tool` and the model continues. Turn it off to let tools run automatically. Configure the sensitive-tool list in [chat-ui/lib/tools.ts](chat-ui/lib/tools.ts).

**Agents**

- An **agent picker** in the top bar switches between focused personas, each with a tailored system prompt and scoped to a subset of MCP servers:
  - **General** — all tools across every server.
  - **Code Assistant** — `mcp-local-coder` only (read/write/search code).
  - **Azure Expert** — `AzLens-mcp` only (resource queries, KQL, docs).
  - **Personal Assistant** — `mcp-personal-assistant` only (notes & to-dos).
  - **GitHub** — `mcp-github` only (repos, issues, PRs, file contents).
  - **FinOps** — `mcp-azure-cost` only (spend, forecasts, budgets).
  - **Research** — `mcp-knowledge` only (grounded answers with citations).
  - **Data Analyst** — `mcp-postgres` only (read-only SQL over your database).
- Add or edit agents in [chat-ui/lib/agents.ts](chat-ui/lib/agents.ts).

**MCP tools panel**

- Live **health dots** (online / down / off) for each server, polled every 15s via `/api/mcp/health`.
- **Click a server** to expand its tools; **click a tool** to draft an example prompt into the composer.

**Navigation & appearance**

- **⌘K / Ctrl+K command palette** — jump to any chat or run actions (new chat, toggle theme, export/import).
- **Dark mode** toggle (persisted).
- Collapsible sidebar that becomes a slim **icon rail**, with entries for **Projects** and **Artifacts** and a collapsible **Features** group.
- **Composer mode chips** below the input (Swarm / Slide / Deep Research / Websites / Docs / Sheets) and an inline model selector next to Send.
- **Search** to filter conversations.

**API routes (Next.js route handlers)**

| Route                 | Purpose                                                                                                                                                                                                                                                           |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /api/chat`      | Streams a completion; connects to the MCP servers as a client and exposes their tools to the model. Accepts an optional `{ provider, model, agentId }`. Resolves the agent (system prompt + server scope) and, for `provider: "auto"`, routes by task complexity. |
| `GET /api/models`     | Providers/models available, based on which API keys are configured on the server.                                                                                                                                                                                 |
| `POST /api/tool`      | Executes a single MCP tool after the user approves it in the UI (used by tool-approval mode).                                                                                                                                                                     |     | `GET /api/mcp/library` | Lists MCP **prompts** and **resources** across the servers.        |
| `POST /api/mcp/fetch` | Resolves a prompt template or reads a resource, returning text for the composer.                                                                                                                                                                                  |     | `GET /api/mcp/health`  | Server-side health check of each MCP server (avoids browser CORS). |

> `search_wiki` is implemented against **Microsoft Learn** and is extensible to internal wikis (e.g. an Azure DevOps project wiki) — see [AzLens-mcp/src/wiki.ts](AzLens-mcp/src/wiki.ts).

---

## How it works

**MCP servers (dual transport).** Each server's tool logic lives once in `src/server.ts` (`createServer()`), reused by `src/index.ts` (stdio) and `src/http.ts` (Streamable HTTP). The HTTP entry point runs an Express app exposing `POST` / `GET` / `DELETE` on `/mcp` with per-session `StreamableHTTPServerTransport` instances, plus `GET /health`.

**chat-ui as an MCP host.** The `/api/chat` route uses the Vercel AI SDK's `streamText` with tools aggregated from the MCP servers in scope for the selected **agent** (via `experimental_createMCPClient` over Streamable HTTP). For the **Auto** model option, a zero-cost heuristic ([chat-ui/lib/router.ts](chat-ui/lib/router.ts)) classifies each prompt and picks a cheap or powerful model, falling back to another provider if the chosen one (e.g. a local server) is offline. The model decides when to call a tool; read-only tools run automatically, while **mutating tools pause for approval** (their `execute` is withheld so the UI can confirm, then `POST /api/tool` runs them). Results feed back and the final answer streams out. Unreachable MCP servers are skipped so the chat still works without them.

**Authentication.**

- `AzLens-mcp` uses `DefaultAzureCredential` — `az login` locally, managed identity on Azure. The Azure tools pre-check authentication and return a clear hint if not signed in.
- `chat-ui` is protected by Microsoft Entra **Easy Auth** when deployed (configured in Bicep); model access uses provider API keys stored as Container Apps secrets.

**State.** Conversations and messages persist in the browser's localStorage — there is no server-side database. MCP HTTP sessions are in-memory per replica.

---

## Tooling & quality

- **Smoke tests** — `npm run smoke` (root) spawns each MCP server over stdio and exercises its tools.
- **Unit tests** — Vitest in-process tests for `mcp-local-coder` and `mcp-personal-assistant` (`npm test` in each), using the SDK's in-memory transport.
- **Lint & format** — ESLint (`npm run lint`) for the MCP servers, Prettier (`npm run format`), an `.editorconfig`, and a **Husky pre-commit** hook that runs `lint-staged` (formats staged files).
- **CI** ([.github/workflows/ci.yml](.github/workflows/ci.yml)) — smoke test, ESLint, per-project **build/typecheck + tests**, and **`bicep build`** on every pull request and push.
- **Security** — [CodeQL](.github/workflows/codeql.yml) code scanning, [Trivy](.github/workflows/security-scan.yml) image scanning of all seven containers, and [Dependabot](.github/dependabot.yml) updates for npm, Docker, and GitHub Actions.
- **Observability** — set `APPLICATIONINSIGHTS_CONNECTION_STRING` and all seven apps export traces, logs, and metrics to **Application Insights** via `@azure/monitor-opentelemetry` (servers: `src/telemetry.ts`; chat-ui: `instrumentation.ts`). The chat route also emits a custom **`chat.turn`** span per reply with the agent, provider, model, routed tier, and token counts. The Bicep provisions a workspace-based Application Insights resource and injects the connection string automatically. Leave it unset to disable.
- **Internal-only MCP servers (default)** — the MCP servers deploy with **internal** ingress (`mcpIngressExternal=false`), reachable only by `chat-ui` within the Container Apps environment. Set `mcpIngressExternal=true` to expose them publicly (e.g. for the MCP Inspector).

---

## Operations & hardening

- **MCP session state is in-memory per replica.** The MCP servers therefore deploy with **`maxReplicas: 1`** (in [infra/container-app.bicep](infra/container-app.bicep)). To scale a server beyond one replica, enable session affinity or externalize sessions (e.g. Redis); otherwise a client's follow-up request may hit a replica that doesn't know the session. `chat-ui` is stateless per request and deploys with **`minReplicas: 2`** for availability.
- **Rate limiting.** Set `rateLimitPerMin` to throttle `/api/chat`; deploy `deployRedis=true` (Azure Cache for Redis) for **cluster-wide** limits across the two chat-ui replicas — otherwise the limiter is per-replica in-memory.
- **Ephemeral storage.** `mcp-local-coder` (`/app/workspace`) and `mcp-personal-assistant` (`/app/notes`) write to the container's ephemeral disk. Mount an Azure Files volume for persistence.
- **Reproducible builds.** Run `npm install` in each project once, commit the `package-lock.json`, then switch the Dockerfiles from `npm install` to `npm ci`.
- **Least privilege.** Scope `WORKSPACE_ROOT` narrowly and grant `AzLens-mcp` only the RBAC roles it needs.

---

## Troubleshooting

| Symptom                                     | Likely cause / fix                                                                |
| ------------------------------------------- | --------------------------------------------------------------------------------- |
| Workflow fails at Azure login               | Federated credential subject doesn't match the branch, or missing repo secrets    |
| Deployment fails creating a role assignment | The pipeline identity needs **Owner** (or User Access Administrator) on the scope |
| chat-ui returns 500 on send                 | Missing/incorrect `AZURE_OPENAI_*` values, or the model deployment name is wrong  |
| chat-ui shows no tools                      | An `MCP_*_URL` is unreachable or not ending in `/mcp`                             |
| `AzLens-mcp` tool errors with auth          | Managed identity lacks Reader / Log Analytics Reader (see Step 4)                 |
| `az acr build` fails                        | Pipeline identity lacks push rights; Owner on the RG covers this                  |

### Architecture

#### Deployment topology

Everything runs in one Container Apps environment. A single user-assigned managed identity pulls images from ACR; AzLens-mcp also uses it to query Azure. Only chat-ui is exposed to users behind Entra Easy Auth.
