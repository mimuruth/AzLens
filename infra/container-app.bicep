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

@description('Whether ingress is public (external) or internal to the environment.')
param externalIngress bool = true

@description('Minimum replica count.')
param minReplicas int = 1

@description('Maximum replica count.')
param maxReplicas int = 3

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
    }
  }
}

output fqdn string = 'https://${containerApp.properties.configuration.ingress.fqdn}'
output name string = containerApp.name
