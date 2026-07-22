// -----------------------------------------------------------------------------
// main.bicep — Azure Container Apps environment + 3 MCP servers
// -----------------------------------------------------------------------------
// Deploys, at resource-group scope:
//   - Log Analytics workspace (Container Apps environment logs)
//   - Azure Container Registry (ACR)
//   - User-assigned managed identity (with AcrPull on the registry)
//   - Container Apps managed environment
//   - Three container apps: mcp-local-coder, AzLens-mcp, mcp-personal-assistant
//
// Deploy:
//   az group create -n rg-mcp -l eastus
//   az deployment group create -g rg-mcp -f infra/main.bicep -p infra/main.parameters.json
// -----------------------------------------------------------------------------

targetScope = 'resourceGroup'

@description('Location for all resources.')
param location string = resourceGroup().location

@description('Prefix used to name resources. Keep it short and lowercase.')
@minLength(3)
@maxLength(11)
param namePrefix string = 'mcp'

@description('Container image for mcp-local-coder (e.g. <acr>.azurecr.io/mcp-local-coder:latest).')
param localCoderImage string = 'mcr.microsoft.com/k8se/quickstart:latest'

@description('Container image for AzLens-mcp.')
param azLensImage string = 'mcr.microsoft.com/k8se/quickstart:latest'

@description('Container image for mcp-personal-assistant.')
param personalAssistantImage string = 'mcr.microsoft.com/k8se/quickstart:latest'

@description('Container image for mcp-github.')
param githubImage string = 'mcr.microsoft.com/k8se/quickstart:latest'

@description('Container image for mcp-azure-cost.')
param azureCostImage string = 'mcr.microsoft.com/k8se/quickstart:latest'

@description('Optional GitHub token for mcp-github (higher rate limit / private repos).')
@secure()
param githubToken string = ''

@description('Azure subscription ID that AzLens-mcp queries (ARM). Defaults to the current subscription.')
param azLensSubscriptionId string = subscription().subscriptionId

@description('Optional Log Analytics workspace (customer) ID used by AzLens-mcp run_kql_query.')
param azLensLogAnalyticsCustomerId string = ''

@description('Expose the MCP servers publicly (true) or keep them internal to the environment, reachable only by chat-ui (false).')
param mcpIngressExternal bool = true

// --- chat-ui (ChatGPT-style front end) ---------------------------------------

@description('Container image for the chat-ui front end.')
param chatUiImage string = 'mcr.microsoft.com/k8se/quickstart:latest'

@description('Azure OpenAI resource name (not the full URL).')
param azureOpenAiResourceName string = ''

@description('Azure OpenAI chat model deployment name.')
param azureOpenAiDeployment string = 'gpt-4o'

@description('Azure OpenAI API version.')
param azureOpenAiApiVersion string = '2024-10-21'

@description('Azure OpenAI API key. Stored as a Container Apps secret.')
@secure()
param azureOpenAiApiKey string = ''

@description('Entra application (client) ID that protects chat-ui with Easy Auth. Leave empty to disable auth.')
param entraClientId string = ''

@description('Entra client secret for Easy Auth. Stored as a Container Apps secret.')
@secure()
param entraClientSecret string = ''

@description('Store secrets in Key Vault and reference them from the container apps (recommended). When false, secrets are set inline as Container Apps secrets.')
param useKeyVault bool = false

var uniqueSuffix = uniqueString(resourceGroup().id)
var acrName = toLower('${namePrefix}acr${uniqueSuffix}')
var logAnalyticsName = '${namePrefix}-logs-${uniqueSuffix}'
var environmentName = '${namePrefix}-env-${uniqueSuffix}'
var identityName = '${namePrefix}-id-${uniqueSuffix}'
var keyVaultName = toLower('${namePrefix}kv${take(uniqueSuffix, 8)}')
var keyVaultUri = 'https://${keyVaultName}${environment().suffixes.keyvaultDns}/'
var targetPort = 3000
var enableAuth = !empty(entraClientId)

// AcrPull role definition ID.
var acrPullRoleId = subscriptionResourceId(
  'Microsoft.Authorization/roleDefinitions',
  '7f951dda-4ed3-4680-a7ca-43fe172d538d'
)

// ---------------------------------------------------------------------------
// Managed identity used by all container apps to pull from ACR.
// ---------------------------------------------------------------------------
resource identity 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' = {
  name: identityName
  location: location
}

// ---------------------------------------------------------------------------
// Container registry.
// ---------------------------------------------------------------------------
resource acr 'Microsoft.ContainerRegistry/registries@2023-11-01-preview' = {
  name: acrName
  location: location
  sku: {
    name: 'Basic'
  }
  properties: {
    adminUserEnabled: false
  }
}

// Grant the managed identity permission to pull images from ACR.
resource acrPull 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(acr.id, identity.id, acrPullRoleId)
  scope: acr
  properties: {
    principalId: identity.properties.principalId
    roleDefinitionId: acrPullRoleId
    principalType: 'ServicePrincipal'
  }
}

// ---------------------------------------------------------------------------
// Key Vault (optional) — stores app secrets, referenced by the container apps
// through the shared managed identity instead of inlining secret values.
// ---------------------------------------------------------------------------
// Key Vault Secrets User role definition ID.
var kvSecretsUserRoleId = subscriptionResourceId(
  'Microsoft.Authorization/roleDefinitions',
  '4633458b-17de-408a-b874-0445c86b69e6'
)

resource keyVault 'Microsoft.KeyVault/vaults@2023-07-01' = if (useKeyVault) {
  name: keyVaultName
  location: location
  properties: {
    sku: {
      family: 'A'
      name: 'standard'
    }
    tenantId: tenant().tenantId
    enableRbacAuthorization: true
    enableSoftDelete: true
    softDeleteRetentionInDays: 7
    publicNetworkAccess: 'Enabled'
  }
}

// Let the managed identity read secrets from the vault.
resource kvSecretsUser 'Microsoft.Authorization/roleAssignments@2022-04-01' = if (useKeyVault) {
  name: guid(keyVaultName, identity.id, 'kv-secrets-user')
  scope: keyVault
  properties: {
    principalId: identity.properties.principalId
    roleDefinitionId: kvSecretsUserRoleId
    principalType: 'ServicePrincipal'
  }
}

resource kvOpenAiSecret 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = if (useKeyVault && !empty(azureOpenAiApiKey)) {
  parent: keyVault
  name: 'azure-openai-api-key'
  properties: {
    value: azureOpenAiApiKey
  }
}

resource kvGithubSecret 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = if (useKeyVault && !empty(githubToken)) {
  parent: keyVault
  name: 'github-token'
  properties: {
    value: githubToken
  }
}

resource kvAadSecret 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = if (useKeyVault && enableAuth) {
  parent: keyVault
  name: 'aad-client-secret'
  properties: {
    value: entraClientSecret
  }
}

// Secret entries (inline value vs Key Vault reference) reused by the apps below.
var githubTokenSecrets = empty(githubToken)
  ? []
  : [
      useKeyVault
        ? {
            name: 'github-token'
            keyVaultUrl: '${keyVaultUri}secrets/github-token'
            identity: identity.id
          }
        : {
            name: 'github-token'
            value: githubToken
          }
    ]
var githubTokenEnv = empty(githubToken)
  ? []
  : [
      {
        name: 'GITHUB_TOKEN'
        secretRef: 'github-token'
      }
    ]
var openAiSecrets = empty(azureOpenAiApiKey)
  ? []
  : [
      useKeyVault
        ? {
            name: 'azure-openai-api-key'
            keyVaultUrl: '${keyVaultUri}secrets/azure-openai-api-key'
            identity: identity.id
          }
        : {
            name: 'azure-openai-api-key'
            value: azureOpenAiApiKey
          }
    ]
var openAiKeyEnv = empty(azureOpenAiApiKey)
  ? []
  : [
      {
        name: 'AZURE_OPENAI_API_KEY'
        secretRef: 'azure-openai-api-key'
      }
    ]
var aadSecrets = !enableAuth
  ? []
  : [
      useKeyVault
        ? {
            name: 'aad-client-secret'
            keyVaultUrl: '${keyVaultUri}secrets/aad-client-secret'
            identity: identity.id
          }
        : {
            name: 'aad-client-secret'
            value: entraClientSecret
          }
    ]

// ---------------------------------------------------------------------------
// Log Analytics + Container Apps environment.
// ---------------------------------------------------------------------------
resource logAnalytics 'Microsoft.OperationalInsights/workspaces@2023-09-01' = {
  name: logAnalyticsName
  location: location
  properties: {
    sku: {
      name: 'PerGB2018'
    }
    retentionInDays: 30
  }
}

// Workspace-based Application Insights for distributed tracing + metrics.
resource appInsights 'Microsoft.Insights/components@2020-02-02' = {
  name: '${namePrefix}-appi-${uniqueSuffix}'
  location: location
  kind: 'web'
  properties: {
    Application_Type: 'web'
    WorkspaceResourceId: logAnalytics.id
  }
}

resource acaEnvironment 'Microsoft.App/managedEnvironments@2024-03-01' = {
  name: environmentName
  location: location
  properties: {
    appLogsConfiguration: {
      destination: 'log-analytics'
      logAnalyticsConfiguration: {
        customerId: logAnalytics.properties.customerId
        sharedKey: logAnalytics.listKeys().primarySharedKey
      }
    }
  }
}

// ---------------------------------------------------------------------------
// The three MCP container apps.
// ---------------------------------------------------------------------------
module localCoder 'container-app.bicep' = {
  name: 'mcp-local-coder'
  params: {
    name: 'mcp-local-coder'
    location: location
    environmentId: acaEnvironment.id
    identityId: identity.id
    acrLoginServer: acr.properties.loginServer
    image: localCoderImage
    targetPort: targetPort
    externalIngress: mcpIngressExternal
    envVars: [
      {
        name: 'PORT'
        value: string(targetPort)
      }
      {
        name: 'WORKSPACE_ROOT'
        value: '/app/workspace'
      }
      {
        name: 'APPLICATIONINSIGHTS_CONNECTION_STRING'
        value: appInsights.properties.ConnectionString
      }
    ]
  }
  dependsOn: [
    acrPull
  ]
}

module azLens 'container-app.bicep' = {
  name: 'azlens-mcp'
  params: {
    name: 'azlens-mcp'
    location: location
    environmentId: acaEnvironment.id
    identityId: identity.id
    acrLoginServer: acr.properties.loginServer
    image: azLensImage
    targetPort: targetPort
    externalIngress: mcpIngressExternal
    envVars: [
      {
        name: 'PORT'
        value: string(targetPort)
      }
      {
        name: 'AZURE_SUBSCRIPTION_ID'
        value: azLensSubscriptionId
      }
      {
        name: 'AZURE_CLIENT_ID'
        value: identity.properties.clientId
      }
      {
        name: 'LOG_ANALYTICS_WORKSPACE_ID'
        value: azLensLogAnalyticsCustomerId
      }
      {
        name: 'APPLICATIONINSIGHTS_CONNECTION_STRING'
        value: appInsights.properties.ConnectionString
      }
    ]
  }
  dependsOn: [
    acrPull
  ]
}

module personalAssistant 'container-app.bicep' = {
  name: 'mcp-personal-assistant'
  params: {
    name: 'mcp-personal-assistant'
    location: location
    environmentId: acaEnvironment.id
    identityId: identity.id
    acrLoginServer: acr.properties.loginServer
    image: personalAssistantImage
    targetPort: targetPort
    externalIngress: mcpIngressExternal
    envVars: [
      {
        name: 'PORT'
        value: string(targetPort)
      }
      {
        name: 'NOTES_ROOT'
        value: '/app/notes'
      }
      {
        name: 'APPLICATIONINSIGHTS_CONNECTION_STRING'
        value: appInsights.properties.ConnectionString
      }
    ]
  }
  dependsOn: [
    acrPull
  ]
}

module github 'container-app.bicep' = {
  name: 'mcp-github'
  params: {
    name: 'mcp-github'
    location: location
    environmentId: acaEnvironment.id
    identityId: identity.id
    acrLoginServer: acr.properties.loginServer
    image: githubImage
    targetPort: targetPort
    externalIngress: mcpIngressExternal
    secrets: githubTokenSecrets
    envVars: concat(
      [
        {
          name: 'PORT'
          value: string(targetPort)
        }
        {
          name: 'APPLICATIONINSIGHTS_CONNECTION_STRING'
          value: appInsights.properties.ConnectionString
        }
      ],
      githubTokenEnv
    )
  }
  dependsOn: [
    acrPull
    kvSecretsUser
    kvGithubSecret
  ]
}

module azureCost 'container-app.bicep' = {
  name: 'mcp-azure-cost'
  params: {
    name: 'mcp-azure-cost'
    location: location
    environmentId: acaEnvironment.id
    identityId: identity.id
    acrLoginServer: acr.properties.loginServer
    image: azureCostImage
    targetPort: targetPort
    externalIngress: mcpIngressExternal
    envVars: [
      {
        name: 'PORT'
        value: string(targetPort)
      }
      {
        name: 'AZURE_SUBSCRIPTION_ID'
        value: azLensSubscriptionId
      }
      {
        name: 'AZURE_CLIENT_ID'
        value: identity.properties.clientId
      }
      {
        name: 'APPLICATIONINSIGHTS_CONNECTION_STRING'
        value: appInsights.properties.ConnectionString
      }
    ]
  }
  dependsOn: [
    acrPull
  ]
}

// ---------------------------------------------------------------------------
// chat-ui — ChatGPT-style front end (Azure OpenAI + MCP client).
// Declared inline (not via the shared module) because it needs secrets and,
// optionally, Easy Auth.
// ---------------------------------------------------------------------------
resource chatUi 'Microsoft.App/containerApps@2024-03-01' = {
  name: 'chat-ui'
  location: location
  identity: {
    type: 'UserAssigned'
    userAssignedIdentities: {
      '${identity.id}': {}
    }
  }
  properties: {
    managedEnvironmentId: acaEnvironment.id
    configuration: {
      activeRevisionsMode: 'Single'
      ingress: {
        external: true
        targetPort: targetPort
        transport: 'auto'
        allowInsecure: false
        traffic: [
          {
            latestRevision: true
            weight: 100
          }
        ]
      }
      registries: [
        {
          server: acr.properties.loginServer
          identity: identity.id
        }
      ]
      secrets: concat(openAiSecrets, aadSecrets)
    }
    template: {
      containers: [
        {
          name: 'chat-ui'
          image: chatUiImage
          resources: {
            cpu: json('0.5')
            memory: '1Gi'
          }
          env: concat(
            [
              {
                name: 'PORT'
                value: string(targetPort)
              }
              {
                name: 'AZURE_OPENAI_RESOURCE_NAME'
                value: azureOpenAiResourceName
              }
              {
                name: 'AZURE_OPENAI_DEPLOYMENT'
                value: azureOpenAiDeployment
              }
              {
                name: 'AZURE_OPENAI_API_VERSION'
                value: azureOpenAiApiVersion
              }
              {
                name: 'MCP_LOCAL_CODER_URL'
                value: '${localCoder.outputs.fqdn}/mcp'
              }
              {
                name: 'MCP_AZLENS_URL'
                value: '${azLens.outputs.fqdn}/mcp'
              }
              {
                name: 'MCP_PERSONAL_ASSISTANT_URL'
                value: '${personalAssistant.outputs.fqdn}/mcp'
              }
              {
                name: 'MCP_GITHUB_URL'
                value: '${github.outputs.fqdn}/mcp'
              }
              {
                name: 'MCP_AZURE_COST_URL'
                value: '${azureCost.outputs.fqdn}/mcp'
              }
              {
                name: 'APPLICATIONINSIGHTS_CONNECTION_STRING'
                value: appInsights.properties.ConnectionString
              }
            ],
            openAiKeyEnv
          )
          probes: [
            {
              type: 'Liveness'
              httpGet: {
                path: '/'
                port: targetPort
              }
              initialDelaySeconds: 10
              periodSeconds: 30
            }
          ]
        }
      ]
      scale: {
        minReplicas: 1
        maxReplicas: 3
      }
    }
  }
  dependsOn: [
    acrPull
    kvSecretsUser
    kvOpenAiSecret
    kvAadSecret
  ]
}

// Optional Easy Auth: protects chat-ui behind Microsoft Entra sign-in.
resource chatUiAuth 'Microsoft.App/containerApps/authConfigs@2024-03-01' = if (enableAuth) {
  parent: chatUi
  name: 'current'
  properties: {
    platform: {
      enabled: true
    }
    globalValidation: {
      unauthenticatedClientAction: 'RedirectToLoginPage'
      redirectToProvider: 'azureactivedirectory'
    }
    identityProviders: {
      azureActiveDirectory: {
        enabled: true
        registration: {
          clientId: entraClientId
          openIdIssuer: '${environment().authentication.loginEndpoint}${tenant().tenantId}/v2.0'
          clientSecretSettingName: 'aad-client-secret'
        }
        validation: {
          allowedAudiences: [
            'api://${entraClientId}'
          ]
        }
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Outputs
// ---------------------------------------------------------------------------
output acrLoginServer string = acr.properties.loginServer
output acrName string = acr.name
output appInsightsConnectionString string = appInsights.properties.ConnectionString
output keyVaultName string = useKeyVault ? keyVaultName : ''
output managedIdentityClientId string = identity.properties.clientId
output managedIdentityPrincipalId string = identity.properties.principalId
output localCoderUrl string = localCoder.outputs.fqdn
output azLensUrl string = azLens.outputs.fqdn
output personalAssistantUrl string = personalAssistant.outputs.fqdn
output githubUrl string = github.outputs.fqdn
output azureCostUrl string = azureCost.outputs.fqdn
output chatUiUrl string = 'https://${chatUi.properties.configuration.ingress.fqdn}'
