// One Truth - Azure Infrastructure
// Deploys: Azure Static Web App (Free) + Storage Account (Table Storage)

targetScope = 'resourceGroup'

@description('Environment name')
@allowed(['prod', 'dev'])
param environment string = 'prod'

@description('Azure region for resources')
param location string = resourceGroup().location

@description('Azure region for Static Web App')
param swaLocation string = 'westus2'

@description('Custom domain for the Static Web App (e.g., truth.k61.dev)')
param customDomain string = ''

param tags object = {
  project: 'one-truth'
  environment: environment
}

var resourceSuffix = environment == 'prod' ? '-prod' : '-${environment}'
var staticSiteName = 'swa-one-truth${resourceSuffix}'
var storageAccountName = 'st1t${uniqueString(resourceGroup().id)}${environment}'

// Storage Account
module storageAccount 'br/public:avm/res/storage/storage-account:0.19.0' = {
  name: 'storageAccountDeployment'
  params: {
    name: storageAccountName
    location: location
    tags: tags
    skuName: 'Standard_LRS'
    kind: 'StorageV2'
    allowBlobPublicAccess: false
    allowSharedKeyAccess: true
    publicNetworkAccess: 'Enabled'
    networkAcls: {
      defaultAction: 'Allow'
    }

    tableServices: {
      tables: [
        { name: 'games' }
        { name: 'players' }
        { name: 'statements' }
        { name: 'votes' }
        { name: 'gamekeepers' }
      ]
    }
  }
}

// Static Web App (Free tier — uses built-in AAD auth, no custom provider config needed)
module staticSite 'br/public:avm/res/web/static-site:0.7.0' = {
  name: 'staticSiteDeployment'
  params: {
    name: staticSiteName
    location: swaLocation
    tags: tags
    sku: 'Free'
    customDomains: customDomain != '' ? [customDomain] : []
  }
}

// Wire storage connection string to SWA app settings
resource swaAppSettings 'Microsoft.Web/staticSites/config@2024-04-01' = {
  name: '${staticSiteName}/appsettings'
  properties: {
    AZURE_STORAGE_CONNECTION_STRING: 'DefaultEndpointsProtocol=https;AccountName=${storageAccountName};AccountKey=${listKeys(resourceId('Microsoft.Storage/storageAccounts', storageAccountName), '2023-05-01').keys[0].value};EndpointSuffix=core.windows.net'
  }
  dependsOn: [
    staticSite
    storageAccount
  ]
}

// Outputs
output staticSiteName string = staticSite.outputs.name
output staticSiteDefaultHostname string = staticSite.outputs.defaultHostname
output storageAccountName string = storageAccount.outputs.name
