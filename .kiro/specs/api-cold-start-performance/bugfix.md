# Bugfix Requirements Document

## Introduction

The Go URL Alias Service exhibits slow API response times. Cold start requests take 1.5–4 seconds, and even warm requests take 275ms–994ms. The root causes are: (1) the Cosmos DB client is lazily instantiated on the first request rather than at startup, adding SDK initialization overhead to cold starts; (2) the `@azure/cosmos` CosmosClient is created without connection policy optimizations (no preferred location, no keep-alive HTTP agent); (3) the Azure Functions Node.js runtime is pinned to `node:18` instead of the faster `node:20`; and (4) there is no HTTP-level caching for read-heavy, public endpoints like `/api/links?scope=popular`, `/api/links?scope=popular-clicks`, and `/api/auth-config`, causing redundant Cosmos DB round-trips on every page load.

## Bug Analysis

### Current Behavior (Defect)

1.1 WHEN the Azure Functions host cold-starts and the first API request arrives THEN the system lazily creates the CosmosClient inside `getContainer()` on that first request, adding SDK initialization + TCP handshake latency (~1–3s) to the response time

1.2 WHEN the CosmosClient is created in `getContainer()` THEN the system uses default connection settings (no preferred region, no connection timeout tuning) resulting in suboptimal network performance for all subsequent requests

1.3 WHEN a client requests `/api/links?scope=popular`, `/api/links?scope=popular-clicks`, or `/api/auth-config` THEN the system returns no `Cache-Control` headers, causing the browser to re-fetch these endpoints on every page navigation even though the data changes infrequently

1.4 WHEN the Azure Functions runtime starts THEN the system uses `node:18` (as configured in `staticwebapp.config.json` platform.apiRuntime) which has slower startup characteristics compared to `node:20`

1.5 WHEN the CosmosClient is created in `getContainer()` THEN the system does not configure an HTTP agent with `keepAlive: true`, causing new TCP connections to be established for each Cosmos DB operation instead of reusing existing connections

1.6 WHEN `initStorage()` is called during module startup in `index.ts` THEN the system only stores the storage config flag but does not eagerly create the CosmosClient or obtain a container reference, deferring all Cosmos DB initialization to the first request

### Expected Behavior (Correct)

2.1 WHEN the Azure Functions host starts THEN the system SHALL eagerly initialize the CosmosClient and obtain the container reference during module startup (in `initStorage()` or a dedicated init function called from `index.ts`) so that the first request does not pay SDK initialization cost

2.2 WHEN the CosmosClient is created THEN the system SHALL configure connection policy with preferred locations matching the deployment region (via the `connectionPolicy.preferredLocations` option available in the `@azure/cosmos` JS SDK) to reduce per-request latency

2.3 WHEN a client requests `/api/links?scope=popular` or `/api/links?scope=popular-clicks` THEN the system SHALL return a `Cache-Control: public, max-age=<CACHE_MAX_AGE_POPULAR>` header where `CACHE_MAX_AGE_POPULAR` defaults to 3600 seconds (1 hour) and is configurable via the `CACHE_MAX_AGE_POPULAR` environment variable

2.4 WHEN a client requests `/api/auth-config` THEN the system SHALL return a `Cache-Control: public, max-age=<CACHE_MAX_AGE_AUTH_CONFIG>` header where `CACHE_MAX_AGE_AUTH_CONFIG` defaults to 300 seconds (5 minutes) and is configurable via the `CACHE_MAX_AGE_AUTH_CONFIG` environment variable

2.7 WHEN the `CACHE_MAX_AGE_POPULAR` or `CACHE_MAX_AGE_AUTH_CONFIG` environment variables are set THEN the system SHALL use their numeric values as the `max-age` in the corresponding `Cache-Control` headers; WHEN they are not set THEN the system SHALL use the defaults of 3600 and 300 respectively

2.5 WHEN the Azure Functions runtime starts THEN the system SHALL use `node:20` runtime (via `staticwebapp.config.json` platform.apiRuntime) for improved cold start performance and V8 engine optimizations

2.6 WHEN the CosmosClient is created THEN the system SHALL configure a Node.js `http.Agent` (or `https.Agent`) with `keepAlive: true` to reuse TCP connections across Cosmos DB operations, reducing per-request connection overhead

### Unchanged Behavior (Regression Prevention)

3.1 WHEN the storage mode is in-memory (dev mode without COSMOS_CONNECTION_STRING) THEN the system SHALL CONTINUE TO use the in-memory store without attempting Cosmos DB initialization

3.2 WHEN any API endpoint returns data THEN the system SHALL CONTINUE TO return correct, up-to-date results with the same JSON schema and HTTP status codes

3.3 WHEN authenticated endpoints are called without valid credentials THEN the system SHALL CONTINUE TO return 401 Unauthorized responses

3.4 WHEN the redirect endpoint resolves an alias THEN the system SHALL CONTINUE TO perform analytics side-effects (click_count, heat_score, last_accessed_at) and return 302 redirects

3.5 WHEN write operations (create, update, delete, renew) are performed THEN the system SHALL CONTINUE TO persist changes to Cosmos DB with the same validation and authorization logic

3.6 WHEN the expiry processor timer fires THEN the system SHALL CONTINUE TO evaluate and transition alias expiry states correctly

3.7 WHEN non-popular scope requests are made to `/api/links` (e.g., authenticated user listing, search) THEN the system SHALL CONTINUE TO return fresh, uncached results
