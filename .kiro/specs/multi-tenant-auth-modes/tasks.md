# Implementation Plan: Multi-Tenant Auth Modes

## Overview

Rearchitect the authentication layer from a binary `DEV_MODE` toggle into a strategy-pattern system supporting three deployment modes (`corporate`, `public`, `dev`). Implementation proceeds bottom-up: foundational interfaces → strategy implementations → factory/registry → storage refactoring → handler DI refactoring → new endpoints → SWA config generation → frontend adaptation → cleanup.

## Tasks

- [ ] 1. Create AuthStrategy interface and strategy implementations
  - [ ] 1.1 Create `api/src/shared/auth-strategy.ts` with `AuthMode` type, `AuthIdentity` interface, `AuthStrategy` interface, `StrategyRegistry`, and `StrategyFactory`
    - Define `AuthMode = "corporate" | "public" | "dev"`
    - Define `AuthIdentity` with `email: string` and `roles: string[]`
    - Define `AuthStrategy` interface with `mode`, `extractIdentity()`, `redirectRequiresAuth`, `identityProviders`
    - Implement `StrategyRegistry` as a record mapping `AuthMode` to constructor functions, with `registerStrategy()` for extensibility
    - Implement `StrategyFactory.createStrategy()` that reads `AUTH_MODE` and `CORPORATE_LOCK` env vars, validates, and returns a frozen strategy instance
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 2.1, 2.2, 2.4, 10.1, 10.2, 10.3, 10.4, 10.6_

  - [ ] 1.2 Implement `CorporateStrategy` class in `api/src/shared/auth-strategy.ts`
    - Reuse `parseClientPrincipal` from `client-principal.ts` for `extractIdentity`
    - Set `redirectRequiresAuth = true`, `identityProviders = ["aad"]`, `mode = "corporate"`
    - Return null for missing/invalid `x-ms-client-principal` header
    - _Requirements: 3.1, 3.2, 3.7_

  - [ ] 1.3 Implement `PublicStrategy` class in `api/src/shared/auth-strategy.ts`
    - Same `extractIdentity` logic as Corporate (SWA provides same header format)
    - Set `redirectRequiresAuth = false`
    - Read `PUBLIC_AUTH_PROVIDERS` env var (comma-separated), default to `["google"]`
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5_

  - [ ] 1.4 Implement `DevStrategy` class in `api/src/shared/auth-strategy.ts`
    - Priority chain: `x-mock-user-email` header → `DEV_USER_EMAIL` env → `"dev@localhost"`
    - Priority chain for roles: `x-mock-user-roles` header → `DEV_USER_ROLES` env → `"User"`
    - Always return non-null identity, set `redirectRequiresAuth = false`, `identityProviders = ["dev"]`
    - _Requirements: 5.1, 5.2, 5.3, 5.4_

  - [ ] 1.5 Write property tests for strategy factory mode resolution (P1)
    - **Property 1: Strategy factory mode resolution**
    - **Validates: Requirements 1.1, 1.2, 1.3, 2.1, 2.2**
    - File: `api/tests/property/auth-strategy.property.ts`

  - [ ] 1.6 Write property test for SWA header identity extraction round-trip (P2)
    - **Property 2: SWA header identity extraction round-trip**
    - **Validates: Requirements 3.1, 4.3**
    - File: `api/tests/property/auth-strategy.property.ts`

  - [ ] 1.7 Write property test for invalid header returns null identity (P3)
    - **Property 3: Invalid header returns null identity**
    - **Validates: Requirements 3.2, 4.4**
    - File: `api/tests/property/auth-strategy.property.ts`

  - [ ]\* 1.8 Write property test for dev strategy identity priority chain (P4)
    - **Property 4: Dev strategy identity priority chain**
    - **Validates: Requirements 5.1, 5.2**
    - File: `api/tests/property/auth-strategy.property.ts`

  - [ ]\* 1.9 Write property test for dev strategy always returns non-null identity (P5)
    - **Property 5: Dev strategy always returns non-null identity**
    - **Validates: Requirements 5.3**
    - File: `api/tests/property/auth-strategy.property.ts`

  - [ ] 1.10 Write property test for corporate lock enforcement (P10)
    - **Property 10: Corporate lock enforcement**
    - **Validates: Requirements 10.2, 10.4**
    - File: `api/tests/property/auth-strategy.property.ts`

- [ ] 2. Checkpoint — Ensure all auth-strategy tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 3. Create storage configuration and refactor cosmos-client
  - [ ] 3.1 Create `api/src/shared/storage-config.ts` with `resolveStorage()` function
    - Accept `AuthMode` parameter, check `COSMOS_CONNECTION_STRING` env var
    - Return `{ useInMemory: true }` for dev mode without connection string
    - Throw descriptive error for corporate/public without connection string
    - Return `{ useInMemory: false }` when connection string is present
    - _Requirements: 6.1, 6.3, 6.4_

  - [ ] 3.2 Refactor `api/src/shared/cosmos-client.ts` to accept `StorageConfig` at init
    - Remove the `useInMemory()` function and `DEV_MODE` checks
    - Add an `initStorage(config: StorageConfig)` function that sets the storage mode once at startup
    - All data-access functions use the initialized storage mode instead of per-call `useInMemory()` checks
    - Remove the auto-seeding side effect at the bottom of the file
    - _Requirements: 6.1, 6.5_

  - [ ] 3.3 Refactor `api/src/shared/seed-data.ts` to be called explicitly at startup
    - Remove any auto-import side effects
    - Keep `loadSeedData()` as an explicit function to be called from `index.ts`
    - _Requirements: 6.2_

  - [ ]\* 3.4 Write property test for storage resolution correctness (P11)
    - **Property 11: Storage resolution correctness**
    - **Validates: Requirements 6.1, 6.3, 6.4**
    - File: `api/tests/property/storage-config.property.ts`

- [ ] 4. Refactor startup orchestration in `api/src/index.ts`
  - Orchestrate startup: `createStrategy()` → `resolveStorage()` → `initStorage()` → conditional `loadSeedData()` → handler registration with strategy injection
  - Import and register all function handlers, passing the resolved `AuthStrategy` instance
  - _Requirements: 1.4, 2.3, 6.2_

- [ ] 5. Refactor function handlers to accept AuthStrategy via dependency injection
  - [ ] 5.1 Refactor `api/src/functions/createLink.ts` — export a factory function that accepts `AuthStrategy` and returns the handler; remove `createAuthProvider()` import
    - _Requirements: 2.3, 4.7_

  - [ ] 5.2 Refactor `api/src/functions/updateLink.ts` — same DI pattern as createLink
    - _Requirements: 2.3, 4.8_

  - [ ] 5.3 Refactor `api/src/functions/deleteLink.ts` — same DI pattern as createLink
    - _Requirements: 2.3, 4.9_

  - [ ] 5.4 Refactor `api/src/functions/getLinks.ts` — same DI pattern as createLink
    - _Requirements: 2.3, 4.10_

  - [ ] 5.5 Refactor `api/src/functions/renewLink.ts` — same DI pattern as createLink
    - _Requirements: 2.3_

  - [ ] 5.6 Refactor `api/src/functions/redirect.ts` — accept `AuthStrategy` via DI, implement `redirectRequiresAuth` branching logic
    - When `redirectRequiresAuth` is true and identity is null → 401
    - When `redirectRequiresAuth` is false and identity is null → resolve only public (non-private) aliases, skip private lookup
    - When `redirectRequiresAuth` is false and identity is present → resolve both private and public aliases (existing behavior)
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5_

  - [ ] 5.7 Refactor `api/src/functions/expiryProcessor.ts` — remove any `createAuthProvider()` usage if present (timer trigger, no auth needed)
    - _Requirements: 2.3_

  - [ ] 5.8 Refactor `api/src/functions/scrapeTitle.ts` — remove any `createAuthProvider()` usage if present (utility endpoint, no auth needed)
    - _Requirements: 2.3_

  - [ ] 5.9 Write property test for protected endpoints rejecting unauthenticated requests (P6)
    - **Property 6: Protected endpoints reject unauthenticated requests**
    - **Validates: Requirements 4.7, 4.8, 4.9, 4.10**
    - File: `api/tests/property/protected-endpoints.property.ts`

  - [ ] 5.10 Write property test for redirect endpoint auth enforcement (P7)
    - **Property 7: Redirect endpoint enforces auth when strategy requires it**
    - **Validates: Requirements 3.7, 7.2**
    - File: `api/tests/property/redirect-auth.property.ts`

  - [ ] 5.11 Write property test for unauthenticated redirect resolving only public aliases (P8)
    - **Property 8: Unauthenticated redirect resolves only public aliases**
    - **Validates: Requirements 4.5, 4.6, 7.3, 7.4**
    - File: `api/tests/property/redirect-auth.property.ts`

  - [ ] 5.12 Write property test for authenticated redirect in open mode (P9)
    - **Property 9: Authenticated redirect in open mode resolves all aliases**
    - **Validates: Requirements 7.5**
    - File: `api/tests/property/redirect-auth.property.ts`

- [ ] 6. Checkpoint — Ensure all handler refactoring tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 7. Create auth-config API endpoint
  - [ ] 7.1 Create `api/src/functions/authConfig.ts` — `GET /api/auth-config` endpoint
    - Accept `AuthStrategy` via DI (same pattern as other handlers)
    - Return `{ mode, identityProviders, loginUrl }` as JSON
    - Compute `loginUrl` from the primary identity provider (e.g., `/.auth/login/aad`)
    - This endpoint is unauthenticated (no identity check)
    - _Requirements: 9.1_

- [ ] 8. Create SWA config generation script
  - [ ] 8.1 Create `scripts/generate-swa-config.ts` — reads `AUTH_MODE` and `PUBLIC_AUTH_PROVIDERS`, writes `staticwebapp.config.json`
    - Corporate template: all routes require `authenticated`, only AAD, block github/twitter/google, 401→AAD login redirect
    - Public template: management routes require `authenticated`, `/{alias}` open, configured providers enabled, others blocked, 401→primary provider redirect
    - Dev template: no `allowedRoles`, all providers accessible
    - Exit with error if `AUTH_MODE` is not set
    - Warn if `PUBLIC_AUTH_PROVIDERS` contains unknown provider names
    - _Requirements: 3.3, 3.4, 3.5, 3.6, 4.11, 4.12, 4.13, 4.14, 8.1, 8.2, 8.3, 8.4, 8.5_

  - [ ] 8.2 Write property test for SWA config provider enablement (P12)
    - **Property 12: SWA config provider enablement**
    - **Validates: Requirements 4.1, 4.11, 4.12**
    - File: `api/tests/property/swa-config.property.ts`

  - [ ] 8.3 Write property test for SWA config 401 redirect (P13)
    - **Property 13: SWA config 401 redirect targets primary provider**
    - **Validates: Requirements 8.3**
    - File: `api/tests/property/swa-config.property.ts`

- [ ] 9. Checkpoint — Ensure all SWA config and auth-config tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 10. Frontend auth adaptation
  - [ ] 10.1 Add `getAuthConfig()` to `src/services/api.ts`
    - Fetch `GET /api/auth-config` and return `{ mode, identityProviders, loginUrl }`
    - Define `AuthConfigResponse` interface
    - _Requirements: 9.1_

  - [ ] 10.2 Create auth context in `src/App.tsx`
    - Call `getAuthConfig()` on mount, store result in React context
    - Provide `AuthConfigContext` to all child components
    - _Requirements: 9.1, 9.2, 9.3, 9.6_

  - [ ] 10.3 Adapt `src/components/LandingPage.tsx` for public mode
    - In public mode, show popular links without requiring auth
    - Show sign-in prompt when user tries to create a link without being authenticated
    - _Requirements: 9.4, 9.5_

  - [ ] 10.4 Adapt `src/components/ManagePage.tsx` for public mode
    - In public mode, prompt for sign-in when unauthenticated user navigates to manage page
    - Use `loginUrl` from auth config context for the sign-in redirect
    - _Requirements: 9.5_

- [ ] 11. Cleanup and finalization
  - [ ] 11.1 Delete `api/src/shared/auth-provider.ts`
    - Replaced entirely by `auth-strategy.ts`
    - _Requirements: 6.5_

  - [ ] 11.2 Update `.env.example` — replace `DEV_MODE` with `AUTH_MODE`, add `CORPORATE_LOCK`, `PUBLIC_AUTH_PROVIDERS`
    - Document all new env vars with descriptions and defaults
    - Remove `DEV_MODE` entry
    - _Requirements: 6.5_

  - [ ] 11.3 Verify zero references to `DEV_MODE` in `api/src/`
    - Grep-based check ensuring no `DEV_MODE` references remain in the API source
    - _Requirements: 6.5_

- [ ] 12. Final checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document
- Unit tests validate specific examples and edge cases
- All code is TypeScript (matching the existing codebase)
- `fast-check` and Vitest are already configured in `api/package.json` and `api/vitest.config.ts`
