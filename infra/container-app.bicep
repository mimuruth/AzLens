// -----------------------------------------------------------------------------
// container-app.bicep — reusable Azure Container App module for an MCP server
// -----------------------------------------------------------------------------

@description('Container app name.')
param name string

@description('Location for the container app.')
param location string

@description('Resource ID of the Container Apps managed environment.')
param environmentId string

@description('Resource ID of the user-assigned managed identity.')
param identityId string

@description('ACR login server, e.g. myregistry.azurecr.io.')
param acrLoginServer string

@description('Full container image reference to run.')
param image string

@description('Port the container listens on.')
param targetPort int = 3000

@description('Environment variables for the container.')
param envVars array = []

@description('Container app secrets (inline values or Key Vault references).')
param secrets array = []

@description('Whether ingress is public (external) or internal to the environment.')
param externalIngress bool = true

@description('Minimum replica count.')
param minReplicas int = 1

@description('Maximum replica count. Defaults to 1 because the MCP StreamableHTTP transport keeps session state in-process; raising this requires sticky sessions or externalised session state.')
param maxReplicas int = 1

@description('Optional Azure Files volume: the managed-environment storage name to mount. Empty = no volume.')
param volumeStorageName string = ''

@description('Volume name (in-app) when a storage is mounted.')
param volumeName string = 'data'

@description('Mount path inside the container when a storage is mounted.')
param volumeMountPath string = '/data'

var volumes = empty(volumeStorageName)
  ? []
  : [
      {
        name: volumeName
        storageType: 'AzureFile'
        storageName: volumeStorageName
      }
    ]
var volumeMounts = empty(volumeStorageName)
  ? []
  : [
      {
        volumeName: volumeName
        mountPath: volumeMountPath
      }
    ]

resource containerApp 'Microsoft.App/containerApps@2024-03-01' = {
  name: name
  location: location
  identity: {
    type: 'UserAssigned'
    userAssignedIdentities: {
      '${identityId}': {}
    }
  }
  properties: {
    managedEnvironmentId: environmentId
    configuration: {
      activeRevisionsMode: 'Single'
      ingress: {
        external: externalIngress
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
          server: acrLoginServer
          identity: identityId
        }
      ]
      secrets: secrets
    }
    template: {
      containers: [
        {
          name: name
          image: image
          resources: {
            cpu: json('0.5')
            memory: '1Gi'
          }
          env: envVars
          volumeMounts: volumeMounts
          probes: [
            {
              type: 'Liveness'
              httpGet: {
                path: '/health'
                port: targetPort
              }
              initialDelaySeconds: 5
              periodSeconds: 30
            }
            {
              type: 'Readiness'
              httpGet: {
                path: '/health'
                port: targetPort
              }
              initialDelaySeconds: 3
              periodSeconds: 10
            }
          ]
        }
      ]
      scale: {
        minReplicas: minReplicas
        maxReplicas: maxReplicas
      }
      volumes: volumes
    }
  }
}

output fqdn string = 'https://${containerApp.properties.configuration.ingress.fqdn}'
output name string = containerApp.name
