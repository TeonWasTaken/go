# Design Document: API Cold Start Performance

## Technical Context

The API is an Azure Functions v4 (Node.js, TypeScript) backend deployed on Azure Static Web Apps. Key files:

- `api/src/index.ts` — Entry point. Runs startup orchestration: creates auth strategy, resolves storage config, calls `initStorage()`, loads seed data, then registers all function handlers.
- `api/src/shared/cosmos-client.ts` — Data-access layer. Contains `initStorage()` (stores config flag only), `getContainer()` (lazily creates `CosmosClient` singleton on first call), and all CRUD/query functions.
- `api/src/shared/storage-config.ts` — `resolveStorage()` determines Cosmos vs in-memory mode.
- `api/src/functions/getLinks.ts` — `GET /api/links` handler. Supports `scope=popular` and `scope=popular-clicks` (no auth required). Currently returns no `Cache-Control` headers.
- `api/src/functions/authConfig.ts` — `GET /api/auth-config` handler. Returns auth configuration. Currently returns no `Cache-Control` headers.
- `staticwebapp.config.json` — SWA config with `"apiRuntime": "node:18"`.
- `api/package.json` — Uses `@azure/cosmos ^3.17.3`.

### Current Flow (Cold Start)

1. Module loads → `initStorage(config)` stores `_storageConfig` flag
2. First request arrives → handler calls a data-access function → `getContainer()` creates `CosmosClient` + gets database/container references
3. Response returned with SDK init latency baked in

### Target Flow (After Fix)

1. Module loads → `initStorage(config)` eagerly creates `CosmosClient` with optimized settings (keepAlive agent, preferred locations) and obtains container reference
2. First request arrives → handler calls data-access function → `getContainer()` returns pre-initialized container immediately
3. Popular/auth-config responses include `Cache-Control` headers

## Bug Condition

```pascal
FUNCTION isBugCondition(X)
  INPUT: X of type APIRequest
  OUTPUT: boolean

  // The bug manifests when the system is using Cosmos DB (not in-memory)
  // and either: (a) it's the first request (cold start), or
  // (b) the request is for a cacheable endpoint without Cache-Control headers,
  // or (c) cache durations are not configurable via environment variables
  RETURN X.storageMode = "cosmos" AND (
    X.isFirstRequest = true OR
    X.endpoint IN {"/api/links?scope=popular", "/api/links?scope=popular-clicks", "/api/auth-config"}
  )
END FUNCTION
```

```pascal
// Property: Fix Checking — Eager Initialization
FOR ALL X WHERE X.storageMode = "cosmos" DO
  initStorage'(config)
  ASSERT containerReference IS NOT NULL after initStorage returns
  ASSERT cosmosClient was created with keepAlive agent
  ASSERT cosmosClient was created with preferredLocations
END FOR

// Property: Fix Checking — Cache Headers
FOR ALL X WHERE X.endpoint IN {"/api/links?scope=popular", "/api/links?scope=popular-clicks"} DO
  response ← handleGetLinks'(X)
  expectedMaxAge ← ENV("CACHE_MAX_AGE_POPULAR") OR 3600
  ASSERT response.headers["Cache-Control"] = "public, max-age=" + expectedMaxAge
END FOR

FOR ALL X WHERE X.endpoint = "/api/auth-config" DO
  response ← handleAuthConfig'(X)
  expectedMaxAge ← ENV("CACHE_MAX_AGE_AUTH_CONFIG") OR 300
  ASSERT response.headers["Cache-Control"] = "public, max-age=" + expectedMaxAge
END FOR

// Property: Preservation Checking
FOR ALL X WHERE X.storageMode = "in-memory" DO
  ASSERT initStorage'(config) does NOT create CosmosClient
  ASSERT behavior is identical to initStorage(config)
END FOR

FOR ALL X WHERE X.endpoint = "/api/links" AND X.scope NOT IN {"popular", "popular-clicks"} DO
  response ← handleGetLinks'(X)
  ASSERT response.headers["Cache-Control"] IS UNDEFINED OR response.headers["Cache-Control"] = ""
END FOR
```

## Implementation Plan

### 1. Eager Cosmos Initialization (`api/src/shared/cosmos-client.ts`)

Modify `initStorage()` to eagerly create the `CosmosClient` and obtain the container reference when `useInMemory` is false:

```typescript
export function initStorage(config: StorageConfig): void {
  _storageConfig = config;
  if (!config.useInMemory) {
    // Eagerly initialize the Cosmos client and container
    _container = createOptimizedContainer();
  }
}
```

Extract client creation into a helper that applies all optimizations:

```typescript
import { Agent } from "node:https";

function createOptimizedContainer(): Container {
  const connectionString = process.env.COSMOS_CONNECTION_STRING;
  if (!connectionString) {
    throw new Error("COSMOS_CONNECTION_STRING environment variable is not set");
  }

  const agent = new Agent({ keepAlive: true });
  const preferredLocations = process.env.COSMOS_PREFERRED_LOCATIONS
    ? process.env.COSMOS_PREFERRED_LOCATIONS.split(",").map((s) => s.trim())
    : undefined;

  const client = new CosmosClient({
    connectionString,
    connectionPolicy: {
      ...(preferredLocations && { preferredLocations }),
    },
    agent,
  });

  return client.database("go-url-alias").container("aliases");
}
```

The existing `getContainer()` function remains as a fallback but should no longer be the first-call path for Cosmos mode.

### 2. Cache-Control Headers (`api/src/functions/getLinks.ts`)

Read the cache duration from the `CACHE_MAX_AGE_POPULAR` environment variable (default: 3600) and add `Cache-Control` header to the popular and popular-clicks scope responses:

```typescript
const popularMaxAge = parseInt(process.env.CACHE_MAX_AGE_POPULAR || "3600", 10);

if (scope === "popular") {
  const records = await getPopularGlobalAliases(10);
  return {
    status: 200,
    headers: {
      "content-type": "application/json",
      "cache-control": `public, max-age=${popularMaxAge}`,
    },
    body: JSON.stringify(records),
  };
}
```

Same pattern for `popular-clicks`, using the same `popularMaxAge` value.

### 3. Cache-Control Headers (`api/src/functions/authConfig.ts`)

Read the cache duration from the `CACHE_MAX_AGE_AUTH_CONFIG` environment variable (default: 300) and add `Cache-Control` header to the auth-config response:

```typescript
const authConfigMaxAge = parseInt(
  process.env.CACHE_MAX_AGE_AUTH_CONFIG || "300",
  10,
);

return {
  status: 200,
  headers: {
    "content-type": "application/json",
    "cache-control": `public, max-age=${authConfigMaxAge}`,
  },
  body: JSON.stringify(response),
};
```

### 4. Node.js Runtime Upgrade (`staticwebapp.config.json`)

Change `"apiRuntime": "node:18"` to `"apiRuntime": "node:20"`.

## Correctness Properties

### CP-1: Eager initialization populates container for Cosmos mode

- Requirement: 2.1
- Property: After `initStorage()` is called with `useInMemory: false`, the container singleton is non-null and `getContainer()` returns it without creating a new `CosmosClient`.
- Type: property

### CP-2: In-memory mode does not trigger Cosmos initialization

- Requirement: 3.1
- Property: After `initStorage()` is called with `useInMemory: true`, no `CosmosClient` is created and the container singleton remains undefined.
- Type: property

### CP-3: Popular scope responses include Cache-Control header with default max-age

- Requirement: 2.3
- Property: When `getLinks` handler is called with `scope=popular` and no `CACHE_MAX_AGE_POPULAR` env var is set, the response includes `cache-control: public, max-age=3600`.
- Type: example

### CP-4: Popular-clicks scope responses include Cache-Control header with default max-age

- Requirement: 2.3
- Property: When `getLinks` handler is called with `scope=popular-clicks` and no `CACHE_MAX_AGE_POPULAR` env var is set, the response includes `cache-control: public, max-age=3600`.
- Type: example

### CP-5: Auth-config response includes Cache-Control header with default max-age

- Requirement: 2.4
- Property: When `authConfig` handler is called and no `CACHE_MAX_AGE_AUTH_CONFIG` env var is set, the response includes `cache-control: public, max-age=300`.
- Type: example

### CP-6: Non-popular scope responses do not include Cache-Control

- Requirement: 3.7
- Property: When `getLinks` handler is called without a popular scope (e.g., authenticated listing), the response does not include a `cache-control` header with `max-age`.
- Type: example

### CP-7: Node.js runtime is set to node:20

- Requirement: 2.5
- Property: `staticwebapp.config.json` contains `"apiRuntime": "node:20"`.
- Type: example

### CP-8: CosmosClient created with keepAlive agent

- Requirement: 2.6
- Property: When Cosmos mode is active, the `CosmosClient` is constructed with an HTTPS agent that has `keepAlive: true`.
- Type: example

### CP-9: CosmosClient supports preferred locations configuration

- Requirement: 2.2
- Property: When `COSMOS_PREFERRED_LOCATIONS` env var is set, the `CosmosClient` is constructed with `connectionPolicy.preferredLocations` matching the env var values.
- Type: example

### CP-10: Popular cache duration is configurable via CACHE_MAX_AGE_POPULAR env var

- Requirement: 2.7
- Property: When `CACHE_MAX_AGE_POPULAR` env var is set to a custom value (e.g., `7200`), the `getLinks` handler returns `cache-control: public, max-age=7200` for `scope=popular` and `scope=popular-clicks` responses.
- Type: example

### CP-11: Auth-config cache duration is configurable via CACHE_MAX_AGE_AUTH_CONFIG env var

- Requirement: 2.7
- Property: When `CACHE_MAX_AGE_AUTH_CONFIG` env var is set to a custom value (e.g., `600`), the `authConfig` handler returns `cache-control: public, max-age=600`.
- Type: example
