/**
 * Cosmos DB client and alias repository.
 *
 * Provides a thin data-access layer over the `aliases` container,
 * exposing typed CRUD and query methods used by the Azure Functions.
 *
 * Storage mode (Cosmos DB vs in-memory) is determined once at startup
 * via `initStorage()`. All data-access functions use the initialized
 * storage mode rather than per-call checks.
 */

import { Container, CosmosClient, Database } from "@azure/cosmos";
import * as mem from "./in-memory-store.js";
import { AliasRecord } from "./models.js";
import { StorageConfig } from "./storage-config.js";

// ---------------------------------------------------------------------------
// Storage initialization
// ---------------------------------------------------------------------------

let _storageConfig: StorageConfig | undefined;

/**
 * Initialize the storage mode once at startup.
 * Must be called before any data-access function.
 */
export function initStorage(config: StorageConfig): void {
  _storageConfig = config;
}

function isInMemory(): boolean {
  if (!_storageConfig) {
    throw new Error(
      "Storage not initialized. Call initStorage() before using data-access functions.",
    );
  }
  return _storageConfig.useInMemory;
}

/**
 * Reset storage initialization (for testing only).
 */
export function resetStorage(): void {
  _storageConfig = undefined;
  _container = undefined;
}

// ---------------------------------------------------------------------------
// Singleton client / container
// ---------------------------------------------------------------------------

let _container: Container | undefined;

function getContainer(): Container {
  if (_container) return _container;

  const connectionString = process.env.COSMOS_CONNECTION_STRING;
  if (!connectionString) {
    throw new Error("COSMOS_CONNECTION_STRING environment variable is not set");
  }

  const client = new CosmosClient(connectionString);
  const database: Database = client.database("go-url-alias");
  _container = database.container("aliases");
  return _container;
}

/**
 * Allow tests or startup code to inject a pre-configured container.
 */
export function setContainer(container: Container): void {
  _container = container;
}

// ---------------------------------------------------------------------------
// Point read
// ---------------------------------------------------------------------------

export async function getAliasByPartition(
  alias: string,
  id: string,
): Promise<AliasRecord | undefined> {
  if (isInMemory()) return mem.getByPartition(alias, id);

  const container = getContainer();
  try {
    const { resource } = await container.item(id, alias).read<AliasRecord>();
    return resource ?? undefined;
  } catch (err: any) {
    if (err.code === 404) return undefined;
    throw err;
  }
}

// ---------------------------------------------------------------------------
// List aliases visible to a user (all globals + user's own privates)
// ---------------------------------------------------------------------------

export async function listAliasesForUser(
  userEmail: string,
  sort?: "clicks" | "heat",
): Promise<AliasRecord[]> {
  if (isInMemory()) return mem.listForUser(userEmail, sort);

  const container = getContainer();

  let orderClause = "";
  if (sort === "clicks") orderClause = " ORDER BY c.click_count DESC";
  else if (sort === "heat") orderClause = " ORDER BY c.heat_score DESC";

  const querySpec = {
    query: `SELECT * FROM c WHERE c.is_private = false OR c.created_by = @email${orderClause}`,
    parameters: [{ name: "@email", value: userEmail }],
  };

  const { resources } = await container.items
    .query<AliasRecord>(querySpec)
    .fetchAll();

  return resources;
}

// ---------------------------------------------------------------------------
// Search aliases (case-insensitive substring on alias and title)
// ---------------------------------------------------------------------------

export async function searchAliases(
  userEmail: string,
  searchTerm: string,
): Promise<AliasRecord[]> {
  if (isInMemory()) return mem.search(userEmail, searchTerm);

  const container = getContainer();
  const lower = searchTerm.toLowerCase();

  const querySpec = {
    query: `SELECT * FROM c WHERE (c.is_private = false OR c.created_by = @email) AND (CONTAINS(LOWER(c.alias), @term) OR CONTAINS(LOWER(c.title), @term))`,
    parameters: [
      { name: "@email", value: userEmail },
      { name: "@term", value: lower },
    ],
  };

  const { resources } = await container.items
    .query<AliasRecord>(querySpec)
    .fetchAll();

  return resources;
}

// ---------------------------------------------------------------------------
// Search public aliases only (for anonymous users)
// ---------------------------------------------------------------------------

export async function searchPublicAliases(
  searchTerm: string,
): Promise<AliasRecord[]> {
  if (isInMemory()) return mem.searchPublic(searchTerm);

  const container = getContainer();
  const lower = searchTerm.toLowerCase();

  const querySpec = {
    query: `SELECT * FROM c WHERE c.is_private = false AND (CONTAINS(LOWER(c.alias), @term) OR CONTAINS(LOWER(c.title), @term))`,
    parameters: [{ name: "@term", value: lower }],
  };

  const { resources } = await container.items
    .query<AliasRecord>(querySpec)
    .fetchAll();

  return resources;
}

// ---------------------------------------------------------------------------
// Create alias
// ---------------------------------------------------------------------------

export async function createAlias(record: AliasRecord): Promise<AliasRecord> {
  if (isInMemory()) return mem.create(record);

  const container = getContainer();
  const { resource } = await container.items.create<AliasRecord>(record);
  return resource!;
}

// ---------------------------------------------------------------------------
// Update (replace) alias
// ---------------------------------------------------------------------------

export async function updateAlias(record: AliasRecord): Promise<AliasRecord> {
  if (isInMemory()) return mem.replace(record);

  const container = getContainer();
  const { resource } = await container
    .item(record.id, record.alias)
    .replace<AliasRecord>(record);
  return resource!;
}

// ---------------------------------------------------------------------------
// Delete alias
// ---------------------------------------------------------------------------

export async function deleteAlias(alias: string, id: string): Promise<void> {
  if (isInMemory()) {
    mem.remove(alias, id);
    return;
  }

  const container = getContainer();
  await container.item(id, alias).delete();
}

// ---------------------------------------------------------------------------
// Query expirable aliases (expiry_policy_type != 'never')
// ---------------------------------------------------------------------------

export async function queryExpirableAliases(): Promise<AliasRecord[]> {
  if (isInMemory()) return mem.queryExpirable();

  const container = getContainer();

  const querySpec = {
    query: `SELECT * FROM c WHERE c.expiry_policy_type != 'never'`,
  };

  const { resources } = await container.items
    .query<AliasRecord>(querySpec)
    .fetchAll();

  return resources;
}

// ---------------------------------------------------------------------------
// Popular global aliases by heat score
// ---------------------------------------------------------------------------

export async function getPopularGlobalAliases(
  limit: number = 10,
): Promise<AliasRecord[]> {
  if (isInMemory()) return mem.getPopularGlobal(limit);

  const container = getContainer();

  const querySpec = {
    query: `SELECT TOP @limit * FROM c WHERE c.is_private = false AND c.expiry_status != 'expired' ORDER BY c.heat_score DESC`,
    parameters: [{ name: "@limit", value: limit }],
  };

  const { resources } = await container.items
    .query<AliasRecord>(querySpec)
    .fetchAll();

  return resources;
}

// ---------------------------------------------------------------------------
// Popular global aliases by click count (all time)
// ---------------------------------------------------------------------------

export async function getPopularGlobalAliasesByClicks(
  limit: number = 10,
): Promise<AliasRecord[]> {
  if (isInMemory()) return mem.getPopularGlobalByClicks(limit);

  const container = getContainer();

  const querySpec = {
    query: `SELECT TOP @limit * FROM c WHERE c.is_private = false AND c.expiry_status != 'expired' ORDER BY c.click_count DESC`,
    parameters: [{ name: "@limit", value: limit }],
  };

  const { resources } = await container.items
    .query<AliasRecord>(querySpec)
    .fetchAll();

  return resources;
}
