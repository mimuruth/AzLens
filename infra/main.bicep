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

var uniqueSuffix = uniqueString(resourceGroup().id)
var acrName = toLower('${namePrefix}acr${uniqueSuffix}')
var logAnalyticsName = '${namePrefix}-logs-${uniqueSuffix}'
var environmentName = '${namePrefix}-env-${uniqueSuffix}'
var identityName = '${namePrefix}-id-${uniqueSuffix}'
var targetPort = 3000

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
var enableAuth = !empty(entraClientId)

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
      secrets: concat(
        [
          {
            name: 'azure-openai-api-key'
            value: azureOpenAiApiKey
          }
        ],
        enableAuth
          ? [
              {
                name: 'aad-client-secret'
                value: entraClientSecret
              }
            ]
          : []
      )
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
          env: [
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
              name: 'AZURE_OPENAI_API_KEY'
              secretRef: 'azure-openai-api-key'
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
          ]
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
output managedIdentityClientId string = identity.properties.clientId
output managedIdentityPrincipalId string = identity.properties.principalId
output localCoderUrl string = localCoder.outputs.fqdn
output azLensUrl string = azLens.outputs.fqdn
output personalAssistantUrl string = personalAssistant.outputs.fqdn
output chatUiUrl string = 'https://${chatUi.properties.configuration.ingress.fqdn}'
