# Tasks: API Cold Start Performance Bugfix

## Task 1: Eager Cosmos Client Initialization with Optimized Settings

- [x] 1.1 Create `createOptimizedContainer()` helper in `api/src/shared/cosmos-client.ts` that builds a `CosmosClient` with an `https.Agent` (`keepAlive: true`), optional `connectionPolicy.preferredLocations` from `COSMOS_PREFERRED_LOCATIONS` env var, and returns the container reference
- [x] 1.2 Modify `initStorage()` in `api/src/shared/cosmos-client.ts` to call `createOptimizedContainer()` and assign the result to `_container` when `config.useInMemory` is `false`
- [x] 1.3 Update `getContainer()` to use the pre-initialized `_container` (keep as fallback but it should already be populated after `initStorage`)
- [x] 1.4 Update `resetStorage()` to also clean up any agent references if needed for test isolation

## Task 2: Add Cache-Control Headers to Public Endpoints

- [x] 2.1 In `api/src/functions/getLinks.ts`, read `CACHE_MAX_AGE_POPULAR` env var (default: `3600`) and add `"cache-control": "public, max-age=<value>"` header to the `scope=popular` response
- [x] 2.2 In `api/src/functions/getLinks.ts`, add `"cache-control": "public, max-age=<value>"` header to the `scope=popular-clicks` response using the same `CACHE_MAX_AGE_POPULAR` env var (default: `3600`)
- [x] 2.3 In `api/src/functions/authConfig.ts`, read `CACHE_MAX_AGE_AUTH_CONFIG` env var (default: `300`) and add `"cache-control": "public, max-age=<value>"` header to the response

## Task 3: Upgrade Node.js Runtime

- [x] 3.1 Change `"apiRuntime": "node:18"` to `"apiRuntime": "node:20"` in `staticwebapp.config.json`

## Task 4: Update Tests

- [x] 4.1 Add/update unit tests in `api/tests/unit/storage-config.test.ts` or a new `cosmos-client.test.ts` to verify eager initialization populates the container for Cosmos mode (CP-1) and does not for in-memory mode (CP-2)
- [x] 4.2 Add unit tests for `getLinks` handler verifying `Cache-Control` header is present with default max-age=3600 for `scope=popular` (CP-3) and `scope=popular-clicks` (CP-4), and absent for non-popular scopes (CP-6)
- [x] 4.3 Add unit test for `authConfig` handler verifying `Cache-Control: public, max-age=300` header is present by default (CP-5)
- [x] 4.4 Update the SWA config property test in `api/tests/property/swa-config.property.ts` to assert `apiRuntime` is `"node:20"` (CP-7)
- [x] 4.5 Add unit test verifying that when `CACHE_MAX_AGE_POPULAR` env var is set to a custom value, the `getLinks` handler uses that value in the `Cache-Control` header for popular and popular-clicks scopes (CP-10)
- [x] 4.6 Add unit test verifying that when `CACHE_MAX_AGE_AUTH_CONFIG` env var is set to a custom value, the `authConfig` handler uses that value in the `Cache-Control` header (CP-11)
