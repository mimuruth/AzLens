# MCP Multi-Server Workspace

Three decoupled [Model Context Protocol](https://modelcontextprotocol.io) servers written in TypeScript, deployable to **Azure Container Apps**.

| Server | Purpose | Tools |
| --- | --- | --- |
| `mcp-local-coder` | Local file system + code search | `read_file`, `write_file`, `search_code` |
| `AzLens-mcp` | Azure ARM / KQL / Wiki | `query_azure_resource`, `run_kql_query`, `search_wiki` |
| `mcp-personal-assistant` | Notes + to-do lists | `get_daily_notes`, `update_todo_list` |

Each server ships **two transports** from a single codebase:
- **stdio** (`build/index.js`) — for local clients (Claude Desktop, VS Code).
- **Streamable HTTP** (`build/http.js`) — for hosting on Azure Container Apps.

---

## One-click deploy from GitHub

After pushing this repo to GitHub and completing the [one-time setup](#one-time-azure-setup), open the **Actions** tab, select **Provision and Deploy MCP Servers**, and click **Run workflow**:

**[▶ Run the deploy workflow](../../actions/workflows/deploy.yml)**  _(replace with your repo URL)_

The workflow provisions all Azure infrastructure, builds & pushes the three container images to ACR, deploys the container apps, and prints each server's HTTPS endpoint in the run summary.

> A portal-based "Deploy to Azure" button is intentionally not used: these servers are container images that must be built and pushed to a registry, which the GitHub Actions pipeline handles end-to-end.

---

## One-time Azure setup

The workflow authenticates with **OIDC federation** (no client secrets stored in GitHub). Run these once, replacing `<subscription-id>` and `<owner>/<repo>`:

```bash
# 1. Create an Entra app registration for the pipeline
appId=$(az ad app create --display-name "mcp-deploy" --query appId -o tsv)
az ad sp create --id "$appId"

# 2. Grant it Owner on the subscription (Owner is required because the Bicep
#    creates an AcrPull role assignment; Contributor alone cannot do that).
az role assignment create --assignee "$appId" --role "Owner" \
  --scope "/subscriptions/<subscription-id>"

# 3. Add a federated credential for the main branch
az ad app federated-credential create --id "$appId" --parameters '{
  "name": "github-main",
  "issuer": "https://token.actions.githubusercontent.com",
  "subject": "repo:<owner>/<repo>:ref:refs/heads/main",
  "audiences": ["api://AzureADTokenExchange"]
}'

echo "AZURE_CLIENT_ID = $appId"
```

Then add these **repository secrets** (Settings → Secrets and variables → Actions):

| Secret | Value |
| --- | --- |
| `AZURE_CLIENT_ID` | the `appId` printed above |
| `AZURE_TENANT_ID` | `az account show --query tenantId -o tsv` |
| `AZURE_SUBSCRIPTION_ID` | your subscription ID |

> The workflow runs on the `main` branch by default. If you run it from another branch, add a matching federated credential (`...:ref:refs/heads/<branch>`).

### AzLens permissions (after first deploy)

`AzLens-mcp` uses the deployed managed identity. Grant it read access to the resources it queries:

```bash
clientId=<managedIdentityClientId from deployment outputs>
az role assignment create --assignee "$clientId" --role "Reader" \
  --scope "/subscriptions/<subscription-id>"
az role assignment create --assignee "$clientId" --role "Log Analytics Reader" \
  --scope "<log-analytics-workspace-resource-id>"
```

---

## Local development

Node.js 18+ required. In each server folder:

```bash
npm install
npm run build
npm start          # stdio transport (local MCP clients)
npm run start:http # Streamable HTTP transport (port 3000)
```

For local MCP clients, see [claude_desktop_config.json](claude_desktop_config.json) — replace the placeholder absolute paths with your own.

---

## Manual deploy (without GitHub Actions)

```bash
az group create -n rg-mcp -l eastus
az deployment group create -g rg-mcp -f infra/main.bicep -p infra/main.parameters.json
# then: az acr build ... for each image, and redeploy with the real image params
```

## Notes

- HTTP session state is in-memory per replica. For `maxReplicas > 1`, add session affinity or externalize sessions (e.g. Redis).
- `mcp-local-coder` and `mcp-personal-assistant` write to the container's ephemeral disk. Mount an Azure Files volume for persistence.
- Run `npm install` in each server once and commit the resulting `package-lock.json`, then switch the Dockerfiles to `npm ci` for reproducible builds.
