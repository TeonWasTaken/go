# Implementation Plan: Go URL Alias Service

## Overview

Incremental implementation of the Go URL Alias Service — an internal URL aliasing platform built on Azure Static Web Apps with Azure Functions (Node.js/TypeScript) and Cosmos DB. Tasks are ordered to build foundational layers first (config, data models, utilities), then core backend logic (redirection, CRUD API, expiry), and finally the React frontend dashboard.

## Tasks

- [ ] 1. Project scaffolding and SWA configuration
  - [ ] 1.1 Initialize Azure Functions Node.js project with TypeScript
    - Set up `api/` directory with `tsconfig.json`, `package.json`, and Azure Functions host configuration
    - Install dependencies: `@azure/cosmos`, `fast-check` (dev)
    - _Requirements: 8.4_

  - [ ] 1.2 Create `staticwebapp.config.json`
    - Configure Entra ID as sole auth provider
    - Disable GitHub, Twitter, and all non-Entra ID providers
    - Define custom login route redirecting to Entra ID
    - Configure post-login redirect to original URL
    - Require `authenticated` role on `/api/*` routes
    - Configure navigation fallback to `index.html` for SPA routing
    - Define `User` and `Admin` roles mapped to Entra ID groups
    - _Requirements: 3.1, 3.2, 3.6, 3.7, 3.8, 8.1, 8.2, 8.3, 14.1, 14.2, 14.3, 14.4, 14.8, 14.18_

  - [ ] 1.3 Set up local development environment configuration
    - Create `.env.example` documenting all environment variables: `COSMOS_CONNECTION_STRING`, `DEV_MODE`, `DEV_USER_EMAIL`, `DEV_USER_ROLES`
    - Create `api/local.settings.json` template with `COSMOS_CONNECTION_STRING` pointing to Cosmos DB Emulator (`AccountEndpoint=https://localhost:8081/;AccountKey=...`) and `DEV_MODE` set to `true`
    - Verify Azure Functions Core Tools can connect to Cosmos DB Emulator using the local settings
    - _Requirements: 16.5, 16.6, 16.9, 16.10, 16.11_

- [ ] 2. Shared utilities and data models
  - [ ] 2.1 Implement Auth Provider abstraction and Client Principal parser (`api/shared/auth-provider.ts`, `api/shared/client-principal.ts`)
    - Define `AuthIdentity` interface (`email`, `roles`) and `AuthProvider` interface (`extractIdentity`)
    - Implement `SwaAuthProvider`: decode Base64 `x-ms-client-principal` header, extract `userDetails` (email) and `userRoles`, return typed `AuthIdentity`
    - Implement `MockAuthProvider`: read `x-mock-user-email` and `x-mock-user-roles` headers; fall back to `DEV_USER_EMAIL` / `DEV_USER_ROLES` env vars (default `dev@localhost` / `User`)
    - Implement provider factory: check `DEV_MODE` env var, return `MockAuthProvider` if `true`, otherwise `SwaAuthProvider`
    - Retain standalone `parseClientPrincipal` function for backward compatibility
    - _Requirements: 14.15, 14.16, 14.17, 14.19, 16.1, 16.2, 16.3, 16.4_

  - [ ]\* 2.2 Write property test for Auth Provider and Client Principal parser
    - **Property 20: Client principal identity extraction**
    - **Validates: Requirements 14.15, 14.17**
    - **Property 24: Auth provider uses correct identity source based on mode**
    - **Validates: Requirements 14.19, 16.1, 16.2, 16.3, 16.4**

  - [ ] 2.3 Implement URL merge utility (`api/shared/url-utils.ts`)
    - Merge incoming query params with destination URL params (destination takes precedence for duplicate keys)
    - Handle fragment passthrough (destination fragment takes precedence)
    - Query string and fragment handling are independent
    - _Requirements: 1.13, 1.14, 1.15_

  - [ ]\* 2.4 Write property test for URL merge utility
    - **Property 2: URL merging preserves destination precedence**
    - **Validates: Requirements 1.12, 1.13, 1.14**

  - [ ] 2.5 Define AliasRecord interfaces and validation functions (`api/shared/models.ts`)
    - Define `AliasRecord`, `CreateAliasRequest`, `UpdateAliasRequest` TypeScript interfaces
    - Implement alias format validation (`/^[a-z0-9-]+$/`)
    - Implement destination URL validation
    - Implement expiry policy validation (`never`, `fixed`, `inactivity`)
    - Implement fixed policy config validation (duration_months: 1|3|12 or custom_expires_at as future date)
    - Implement ID generation: global = `{alias}`, private = `{alias}:{created_by}`
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 2.13, 2.14, 2.15_

  - [ ]\* 2.6 Write property tests for alias record invariants and validation
    - **Property 17: Alias record invariants**
    - **Validates: Requirements 5.2, 5.3, 5.4, 5.5, 2.10, 6.4, 15.1, 15.11**
    - **Property 10: Invalid inputs are rejected with 400**
    - **Validates: Requirements 2.11, 2.12, 2.13**
    - **Property 11: Fixed expiry policy accepts valid configurations only**
    - **Validates: Requirements 2.14**

  - [ ] 2.7 Implement expiry computation utility (`api/shared/expiry-utils.ts`)
    - Compute `expires_at` from policy type: `never` -> null, `fixed` with duration -> created_at + months, `fixed` with custom -> custom date, `inactivity` -> now + 12 months
    - Set `expiry_status` to `no_expiry` for `never` policy
    - Default to `fixed` with `duration_months: 12` when no policy provided
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6_

  - [ ]\* 2.8 Write property test for expiry computation
    - **Property 12: Expiry timestamp is computed correctly from policy**
    - **Validates: Requirements 9.2, 9.3, 9.4, 9.5, 2.15**

  - [ ] 2.9 Implement heat score computation utility (`api/shared/heat-utils.ts`)
    - Compute decayed heat: `old_heat * 2^(-hours_elapsed/168) + 1.0`
    - Handle null `heat_updated_at` (first access -> heat = 1.0)
    - Update `heat_updated_at` to current UTC time
    - _Requirements: 15.2, 15.3, 15.4, 15.5_

  - [ ]\* 2.10 Write property test for heat score computation
    - **Property 22: Heat score decay is monotonically decreasing over idle time**
    - **Validates: Requirements 15.2, 15.3, 15.4, 15.5**

- [ ] 3. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 4. Cosmos DB data access layer
  - [ ] 4.1 Implement Cosmos DB client and alias repository (`api/shared/cosmos-client.ts`)
    - Initialize Cosmos client with connection string from environment
    - Create/reference `aliases` container with `/alias` partition key
    - Implement `getAliasByPartition(alias, id)` -- point read
    - Implement `listAliasesForUser(userEmail)` -- cross-partition query: `WHERE is_private = false OR created_by = @email`
    - Implement `searchAliases(userEmail, searchTerm)` -- cross-partition query with `CONTAINS()` on alias and title
    - Implement `createAlias(record)` -- create document
    - Implement `updateAlias(record)` -- replace document
    - Implement `deleteAlias(alias, id)` -- delete document
    - Implement `queryExpirableAliases()` -- cross-partition query: `WHERE expiry_policy_type != 'never'`
    - Implement `getPopularGlobalAliases(limit)` -- query: `WHERE is_private = false ORDER BY heat_score DESC`
    - Implement sort queries for `click_count` and `heat_score` descending
    - _Requirements: 5.1, 2.1, 2.2, 2.8, 2.9, 2.11, 7.3, 7.4, 11.2, 15.10_

- [ ] 5. Redirection Engine
  - [ ] 5.1 Implement redirect Azure Function (`api/redirect/index.ts`)
    - Parse alias from path, normalize to lowercase
    - Extract user identity from Client Principal
    - Check `expiry_status` -- return 410 if expired, redirect to dashboard with expiry message
    - Query private alias for user, then global alias
    - Resolution: private-only -> 302, global-only -> 302, both -> interstitial HTML, neither -> redirect to dashboard with `?suggest={alias}`
    - On successful redirect: increment `click_count`, update `last_accessed_at`, compute and update `heat_score`
    - For `inactivity` policy: recalculate `expires_at` to 12 months from now on access
    - Merge query strings and fragments via URL utility
    - Handle database errors: return 500 with generic message, log details
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 1.9, 1.10, 1.11, 1.12, 1.13, 1.14, 1.15, 6.1, 6.2, 6.3, 7.2, 9.7, 10.3, 13.1_

  - [ ]\* 5.2 Write property tests for redirection engine
    - **Property 1: Alias resolution follows private-first precedence**
    - **Validates: Requirements 1.4, 1.5, 1.6, 1.7, 7.1, 7.2**
    - **Property 3: Successful redirect increments analytics**
    - **Validates: Requirements 1.8, 1.9, 1.10, 6.1, 6.2, 6.3, 15.2, 15.5**
    - **Property 4: Expired aliases block redirection**
    - **Validates: Requirements 1.10, 10.3**
    - **Property 5: Inactivity expiry resets on access**
    - **Validates: Requirements 9.7**

- [ ] 6. Alias CRUD API
  - [ ] 6.1 Implement GET `/api/links` Azure Function
    - Return all global aliases + authenticated user's private aliases
    - Support `search` query param with case-insensitive substring match on alias/title
    - Support `sort=clicks` (descending click_count) and `sort=heat` (descending heat_score)
    - Support `scope=popular` returning top 10 global aliases by heat_score
    - Include `click_count`, `last_accessed_at`, `heat_score` in each record
    - _Requirements: 2.1, 2.2, 2.8, 2.9, 2.10, 2.11, 6.4, 6.5, 7.3, 7.4, 15.9, 15.10, 15.11_

  - [ ]\* 6.2 Write property tests for GET /api/links
    - **Property 6: API returns globals plus only the requesting user's private aliases**
    - **Validates: Requirements 2.1, 7.3, 7.4**
    - **Property 7: Search filters by alias or title**
    - **Validates: Requirements 2.2**
    - **Property 15: Sort by clicks produces descending order**
    - **Validates: Requirements 2.8, 2.9, 6.5, 15.9**
    - **Property 23: Popular links returns only top global aliases by heat**
    - **Validates: Requirements 15.6, 15.8, 15.10**

  - [ ] 6.3 Implement POST `/api/links` Azure Function
    - Validate alias format, destination URL, expiry policy
    - Check for global alias name conflict (case-insensitive) -- return 409 if exists
    - Generate document ID (global: `{alias}`, private: `{alias}:{created_by}`)
    - Set defaults: `click_count: 0`, `heat_score: 0`, `created_at: now`, `created_by` from Client Principal
    - Compute `expires_at` from expiry policy (default: `fixed`, `duration_months: 12`)
    - Create document in Cosmos DB
    - _Requirements: 2.3, 2.4, 2.13, 2.14, 2.15, 2.16, 2.17, 2.19, 5.3, 5.4, 5.5, 9.1, 9.2, 9.3, 9.4, 9.5, 9.6_

  - [ ]\* 6.4 Write property tests for POST /api/links
    - **Property 8: Alias creation applies correct defaults**
    - **Validates: Requirements 2.3, 9.6**
    - **Property 9: Global alias names are unique (case-insensitive)**
    - **Validates: Requirements 2.4, 2.17**

  - [ ] 6.5 Implement PUT `/api/links/:alias` Azure Function
    - Authorize: creator can update own alias; Admin can update any global alias; no one can update another user's private alias
    - Validate updated fields (destination URL, expiry policy)
    - Recalculate `expires_at` on expiry policy change, reset `expiry_status` to `active`
    - For private aliases, scope to authenticated user's record
    - _Requirements: 2.5, 2.6, 2.12, 3.3, 3.4, 3.5_

  - [ ]\* 6.6 Write property test for update authorization and expiry recalculation
    - **Property 13: Update recalculates expiry and resets status**
    - **Validates: Requirements 2.5, 2.6**
    - **Property 16: Authorization enforces role-based access**
    - **Validates: Requirements 3.3, 3.4, 3.5, 2.10**

  - [ ] 6.7 Implement DELETE `/api/links/:alias` Azure Function
    - Authorize: creator can delete own alias; Admin can delete any global alias; no one can delete another user's private alias
    - For private aliases, scope to authenticated user's record
    - Remove document from Cosmos DB
    - _Requirements: 2.7, 2.12, 3.3, 3.4, 3.5_

  - [ ]\* 6.8 Write property test for delete
    - **Property 14: Delete removes the record**
    - **Validates: Requirements 2.7**

  - [ ] 6.9 Implement PUT `/api/links/:alias/renew` Azure Function
    - Authorize: creator or Admin can renew
    - Reset `expires_at` based on current expiry policy
    - Set `expiry_status` to `active`, clear `expired_at`
    - _Requirements: 2.18, 10.4, 10.6_

  - [ ]\* 6.10 Write property test for renewal
    - **Property 19: Renewal resets alias to active state**
    - **Validates: Requirements 2.16, 10.4, 10.6**

- [ ] 7. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 8. Expiry Processor
  - [ ] 8.1 Implement timer-triggered Azure Function (`api/expiry-processor/index.ts`)
    - Configure timer trigger for daily execution (`0 0 2 * * *`)
    - Query all records where `expiry_policy_type !== 'never'`
    - For each record: if `expires_at` within 7 days and status `active` -> set `expiring_soon`; if `expires_at` past and not `expired` -> set `expired` + set `expired_at`; if `expired` and `expired_at` > 14 days ago -> permanently delete
    - Log per-record errors and continue processing
    - Log summary counts on completion (expiring_soon, expired, deleted, errors)
    - _Requirements: 10.1, 10.2, 10.5, 11.1, 11.2, 11.3, 11.4, 11.5, 11.6, 11.7_

  - [ ]\* 8.2 Write property tests for expiry processor
    - **Property 18: Expiry state machine transitions are correct**
    - **Validates: Requirements 10.1, 10.2, 10.5, 11.2, 11.3, 11.4, 11.5**
    - **Property 21: Expiry processor summary matches actual transitions**
    - **Validates: Requirements 11.7**

- [ ] 9. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 10. React SPA scaffolding and design system
  - [ ] 10.1 Initialize React app with TypeScript
    - Set up project in root directory with Vite or Create React App
    - Install dependencies: React, React Router, CSS modules or styled-components
    - Configure Inter font family with system font fallback
    - Configure Vite dev server proxy to forward `/api/*` requests to `http://localhost:7071` (local Azure Functions runtime)
    - _Requirements: 8.4, 12.3, 16.7, 16.8_

  - [ ] 10.2 Implement glassmorphism design system and shared components
    - Create CSS variables/theme for glassmorphism: `backdrop-filter: blur(12px)`, semi-transparent backgrounds, subtle gradients
    - Implement `ToastProvider` component with animated toast notifications (success, error, info)
    - Implement `SkeletonLoader` component for placeholder loading states
    - Respect `prefers-reduced-motion` media query by disabling animations
    - Ensure accessible contrast ratios over blurred backgrounds
    - Add ARIA labels on interactive elements, support keyboard navigation
    - Responsive layout for desktop and tablet viewports
    - _Requirements: 12.1, 12.2, 12.4, 12.5, 12.6, 12.7, 12.9_

- [ ] 11. Management Dashboard core pages
  - [ ] 11.1 Implement API client service (`src/services/api.ts`)
    - Create typed API client for all `/api/links` endpoints (GET, POST, PUT, DELETE, renew)
    - Handle error responses and surface user-readable messages for toast display
    - _Requirements: 4.9_

  - [ ] 11.2 Implement `SearchBar` component
    - Debounced search input (300ms) filtering by alias or title
    - Support `/` keyboard shortcut to focus search bar
    - _Requirements: 4.3, 12.8_

  - [ ] 11.3 Implement `AliasListPage` with `AliasCard` components
    - Display searchable list of global + user's private aliases
    - Show `click_count`, `last_accessed_at`, `expiry_status`, `expires_at` per alias
    - Display "Personal" badge on private aliases
    - Visually distinguish `expiring_soon` (warning indicator) and `expired` (muted/strikethrough) records
    - Provide filter tabs by expiry status: All, Active, Expiring Soon, Expired, No Expiry
    - Skeleton loading states while fetching data
    - _Requirements: 4.1, 4.10, 4.11, 4.12, 4.14, 4.15, 4.17_

  - [ ] 11.4 Implement `PopularLinks` component
    - Display top 10 global aliases ranked by heat score
    - Show alias name, title, and visual heat indicator
    - Fetch from `/api/links?scope=popular`
    - _Requirements: 4.2, 15.6, 15.7, 15.8_

  - [ ] 11.5 Implement `CreateEditModal` with `ExpiryPolicySelector`
    - Form for creating/editing aliases with fields: alias, destination URL, title, global/personal toggle
    - Display aliases in lowercase in forms
    - Two-step expiry policy selector: type selection (Never, Expire on date, After inactivity) -> for "Expire on date": preset durations (1, 3, 12 months) + custom date picker; for "After inactivity": info note about 12-month inactivity window
    - Show informational message when creating personal alias with same name as existing global alias
    - On create: POST to `/api/links`, add to list
    - On edit: pre-fill form, PUT to `/api/links/:alias`
    - Display toast on API errors
    - _Requirements: 4.4, 4.5, 4.6, 4.7, 4.13, 4.18_

  - [ ] 11.6 Implement delete confirmation and renew action
    - Delete: confirmation prompt -> DELETE `/api/links/:alias` -> remove from list
    - Renew: PUT `/api/links/:alias/renew` -> update displayed expiry status to active
    - Display toast on API errors
    - _Requirements: 4.8, 4.16_

- [ ] 12. Interstitial conflict resolution page
  - [ ] 12.1 Implement `InterstitialPage` component
    - Display private alias destination and global alias destination as two distinct options
    - Auto-redirect to private destination after 5 seconds with visible countdown timer
    - Provide clickable links to either destination, cancelling auto-redirect on click
    - Apply glassmorphism design standards
    - _Requirements: 13.1, 13.2, 13.3, 13.4, 13.5, 13.6_

- [ ] 13. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document (24 properties)
- The design uses TypeScript throughout -- all backend Azure Functions and frontend React components use TypeScript
- fast-check is the property-based testing library
