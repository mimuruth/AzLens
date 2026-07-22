import "server-only";
import type { Container } from "@azure/cosmos";

/**
 * Optional Azure Cosmos DB persistence for conversations. Enabled only when
 * COSMOS_ENDPOINT (with AAD / managed identity) or COSMOS_CONNECTION_STRING is
 * set. When unconfigured, every helper is a no-op and the UI falls back to the
 * browser's localStorage — so the app works out of the box with zero setup.
 */
export function cosmosConfigured(): boolean {
  return Boolean(
    process.env.COSMOS_ENDPOINT || process.env.COSMOS_CONNECTION_STRING
  );
}

let containerPromise: Promise<Container | null> | null = null;

async function build(): Promise<Container | null> {
  if (!cosmosConfigured()) return null;
  const { CosmosClient } = await import("@azure/cosmos");
  const databaseId = process.env.COSMOS_DATABASE || "azlens";
  const containerId = process.env.COSMOS_CONTAINER || "conversations";

  let client;
  if (process.env.COSMOS_CONNECTION_STRING) {
    client = new CosmosClient(process.env.COSMOS_CONNECTION_STRING);
  } else {
    const { DefaultAzureCredential } = await import("@azure/identity");
    client = new CosmosClient({
      endpoint: process.env.COSMOS_ENDPOINT as string,
      aadCredentials: new DefaultAzureCredential(),
    });
  }

  // Prefer to create the database/container if we have control-plane rights;
  // otherwise (data-plane-only RBAC) just reference the existing container.
  try {
    const { database } = await client.databases.createIfNotExists({
      id: databaseId,
    });
    const { container } = await database.containers.createIfNotExists({
      id: containerId,
      partitionKey: { paths: ["/userId"] },
    });
    return container;
  } catch {
    return client.database(databaseId).container(containerId);
  }
}

/** Lazily initialise (and cache) the Cosmos container, or null if unconfigured. */
export function getContainer(): Promise<Container | null> {
  if (!containerPromise) {
    containerPromise = build().catch((err) => {
      console.warn("Cosmos init failed; falling back to local storage:", err);
      return null;
    });
  }
  return containerPromise;
}
