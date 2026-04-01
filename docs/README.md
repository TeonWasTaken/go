# Go URL Alias Service

A full-stack URL shortening platform for teams and public communities. Create memorable short links like `go/design-docs` that redirect to long URLs, with support for private aliases, expiry policies, popularity tracking, and multi-tenant authentication.

Built with React + TypeScript (frontend) and Azure Functions + Cosmos DB (backend), deployed on Azure Static Web Apps.

---

## Table of Contents

- [Purpose and Overview](#purpose-and-overview)
- [UX Design](#ux-design)
- [Technical Architecture](#technical-architecture)
- [Authentication and Security](#authentication-and-security)
- [API Reference](#api-reference)
- [Data Model](#data-model)
- [Expiry System](#expiry-system)
- [Heat Score and Popularity](#heat-score-and-popularity)
- [Configuration Reference](#configuration-reference)
- [Deployment](#deployment)
- [Local Development](#local-development)
- [Testing](#testing)
- [Troubleshooting](#troubleshooting)

---

## Purpose and Overview

The Go URL Alias Service provides a "go link" experience — short, human-readable URLs that redirect to internal or external destinations. It is designed to serve two distinct audiences from a single codebase:

- **Corporate deployments**: Every interaction (including following a link) requires Azure Entra ID SSO. Ideal for internal enterprise use where all users are employees.
- **Public deployments**: Anyone can follow a link without signing in. Creating and managing links requires authentication via a configurable OAuth provider (Google, GitHub, etc.).
- **Dev mode**: Local development with mock authentication and an in-memory data store. No external services required.

The deployment mode is selected by a single environment variable (`AUTH_MODE`), and the entire system — API, frontend, and edge routing — adapts automatically.

### Key Capabilities

- **Alias management**: Create, edit, delete, and renew short link aliases
- **Private and global scoping**: Users can create personal aliases that shadow global ones
- **Conflict resolution**: When a private and global alias share the same name, an interstitial page lets the user choose
- **Expiry policies**: Links can expire after a fixed duration, after a period of inactivity, or never
- **Popularity tracking**: A heat score with exponential decay surfaces trending links
- **Auto-scraping**: Destination page titles and favicons are fetched automatically on link creation
- **Configurable prefix**: The alias display prefix (default `go/`) is configurable via `ALIAS_PREFIX` for custom domain branding
- **Query and fragment passthrough**: Incoming query parameters and URL fragments are merged into the destination URL

---

## UX Design

### Pages

| Route           | Component          | Purpose                                                                |
| --------------- | ------------------ | ---------------------------------------------------------------------- |
| `/`             | `LandingPage`      | Homepage with "Create New" CTA and popular links list                  |
| `/manage`       | `ManagePage`       | Authenticated link management with search, filter, edit, delete, renew |
| `/interstitial` | `InterstitialPage` | Conflict resolution when private and global aliases collide            |
| `/kitchen-sink` | `KitchenSinkPage`  | Component showcase for development                                     |
| `/{alias}`      | `AliasRedirect`    | Catch-all that forwards to the redirect API                            |

### Mode-Aware UI Behavior

The frontend fetches `GET /api/auth-config` on mount and stores the result in React context (`AuthConfigContext`). Components consume this to adapt:

| Behavior             | Corporate                             | Public                                                     | Dev                              |
| -------------------- | ------------------------------------- | ---------------------------------------------------------- | -------------------------------- |
| Landing page         | Shows "Create New" (opens modal)      | Shows "Create New" (redirects to sign-in) + sign-in prompt | Shows "Create New" (opens modal) |
| Popular links        | Visible (requires auth to reach page) | Visible without sign-in                                    | Visible                          |
| Manage page          | Full access                           | Prompts sign-in if unauthenticated                         | Full access                      |
| Scope toggle label   | "🌐 Global (All Staff)"               | "🌐 Public"                                                | "🌐 Public"                      |
| Alias prefix display | Configurable via `ALIAS_PREFIX`       | Configurable via `ALIAS_PREFIX`                            | Defaults to `go`                 |

### Scope Toggle

When creating or editing a link, users choose between:

- **🔒 Private (Just You)** — only visible to the creator
- **🌐 Global (All Staff)** or **🌐 Public** — visible to everyone (label adapts to auth mode)

The toggle uses `role="radiogroup"` with keyboard navigation (arrow keys) for accessibility.

### Interstitial Conflict Resolution

When a user has a private alias that shares a name with a global alias, the redirect endpoint sends them to `/interstitial` with both destination URLs. The page:

1. Shows both options (Personal and Global) with truncated URLs
2. Auto-redirects to the personal link after 5 seconds
3. Cancels the countdown if the user clicks either option

### Theme Support

Light and dark themes with system preference detection. Toggle available in the header.

---

## Technical Architecture

### Project Structure

```
├── api/                          # Azure Functions backend
│   ├── src/
│   │   ├── functions/            # HTTP and timer trigger handlers
│   │   │   ├── authConfig.ts     # GET /api/auth-config
│   │   │   ├── createLink.ts     # POST /api/links
│   │   │   ├── deleteLink.ts     # DELETE /api/links/:alias
│   │   │   ├── expiryProcessor.ts # Timer: daily expiry state machine
│   │   │   ├── getLinks.ts       # GET /api/links
│   │   │   ├── redirect.ts       # GET /:alias
│   │   │   ├── renewLink.ts      # PUT /api/links/:alias/renew
│   │   │   ├── scrapeTitle.ts    # GET /api/scrape-title
│   │   │   └── updateLink.ts     # PUT /api/links/:alias
│   │   ├── shared/               # Shared modules
│   │   │   ├── auth-strategy.ts  # Strategy pattern + implementations
│   │   │   ├── client-principal.ts # SWA header parsing
│   │   │   ├── cosmos-client.ts  # Data access layer
│   │   │   ├── expiry-utils.ts   # Expiry computation
│   │   │   ├── heat-utils.ts     # Heat score computation
│   │   │   ├── in-memory-store.ts # Dev mode data store
│   │   │   ├── models.ts         # TypeScript interfaces + validation
│   │   │   ├── seed-data.ts      # Dev mode sample data
│   │   │   ├── storage-config.ts # Storage resolution logic
│   │   │   └── url-utils.ts      # URL merge utility
│   │   └── index.ts              # Startup orchestration
│   └── tests/
│       ├── property/             # Property-based tests (fast-check)
│       └── unit/                 # Unit tests
├── src/                          # React frontend
│   ├── components/               # UI components
│   ├── services/api.ts           # Typed API client
│   ├── utils/                    # Utilities (filtering, search)
│   └── App.tsx                   # Root component + auth context
├── scripts/
│   └── generate-swa-config.ts    # SWA config generator
└── staticwebapp.config.json      # Azure SWA routing config
```

### Startup Sequence

The API entry point (`api/src/index.ts`) orchestrates startup in a strict order:

```
1. createStrategy()    → Read AUTH_MODE + CORPORATE_LOCK, resolve AuthStrategy
2. resolveStorage()    → Determine Cosmos DB vs in-memory based on mode + env
3. initStorage()       → Configure the data-access layer once
4. loadSeedData()      → Populate in-memory store (only when useInMemory=true)
5. Register handlers   → Each handler receives the AuthStrategy via closure
```

If any step fails (invalid mode, missing connection string, corporate lock violation), the process throws and no handlers are registered.

### Dependency Injection

All HTTP handlers are factory functions that accept an `AuthStrategy` and return the actual handler:

```typescript
export function createGetLinksHandler(strategy: AuthStrategy) {
  return async function getLinksHandler(req, context) {
    const identity = strategy.extractIdentity(headers);
    // ...
  };
}
```

This eliminates scattered mode checks and makes every handler testable in isolation.

### Frontend Architecture

- **React 18** with React Router v6
- **Vite** for bundling and dev server
- **AuthConfigContext** provides auth mode, identity providers, login URL, and alias prefix to all components
- **`useAuthConfig()`** hook reads the full config; **`useAliasPrefix()`** hook returns just the prefix string
- Dev proxy in `vite.config.ts` forwards `/api` and `/go-redirect` to the local Functions host

---

## Authentication and Security

### Strategy Pattern

Authentication is implemented via the Strategy pattern. Three strategies implement the `AuthStrategy` interface:

```typescript
interface AuthStrategy {
  readonly mode: "corporate" | "public" | "dev";
  extractIdentity(headers: Record<string, string>): AuthIdentity | null;
  readonly redirectRequiresAuth: boolean;
  readonly identityProviders: string[];
}
```

#### CorporateStrategy

- Extracts identity from the `x-ms-client-principal` Base64 header (Azure SWA)
- `redirectRequiresAuth = true` — even following a link requires authentication
- Identity providers: `["aad"]` (Azure Active Directory only)

#### PublicStrategy

- Same header extraction as Corporate (SWA provides the same format regardless of provider)
- `redirectRequiresAuth = false` — anyone can follow a link
- Identity providers: configurable via `PUBLIC_AUTH_PROVIDERS` env var, defaults to `["google"]`

#### DevStrategy

- Returns a mock identity from headers or env vars (never returns null)
- Email priority: `x-mock-user-email` header → `DEV_USER_EMAIL` env → `"dev@localhost"`
- Roles priority: `x-mock-user-roles` header → `DEV_USER_ROLES` env → `"User"`
- `redirectRequiresAuth = false`

### Strategy Registry

Strategies self-register at module load time:

```typescript
registerStrategy("corporate", () => new CorporateStrategy());
registerStrategy("public", () => new PublicStrategy());
registerStrategy("dev", () => new DevStrategy());
```

The registry is extensible — new strategies can be added without modifying existing code.

### Corporate Lock

The `CORPORATE_LOCK` environment variable is a safety mechanism for corporate deployments. When set to `"true"`:

- The strategy factory checks this **before any other startup logic**
- If `AUTH_MODE` is anything other than `"corporate"`, startup fails immediately with a descriptive error
- This prevents accidental exposure of a corporate deployment in public or dev mode

### Defense in Depth

Security is enforced at three layers:

1. **Azure SWA edge** (`staticwebapp.config.json`): Route-level `allowedRoles` and identity provider blocking
2. **API handlers**: Each protected handler calls `strategy.extractIdentity()` and returns 401 if null
3. **Authorization logic**: Handlers enforce ownership rules (creator can modify own; Admin can modify any global; no one can modify another user's private alias)

### Redirect Endpoint Auth Branching

The redirect handler (`GET /{alias}`) adapts based on `strategy.redirectRequiresAuth`:

| Condition                                       | Behavior                                  |
| ----------------------------------------------- | ----------------------------------------- |
| `redirectRequiresAuth=true` + no identity       | 401 Unauthorized                          |
| `redirectRequiresAuth=false` + no identity      | Resolve only global (non-private) aliases |
| `redirectRequiresAuth=false` + identity present | Resolve both private and global aliases   |

### SWA Config Generation

The `scripts/generate-swa-config.ts` script generates `staticwebapp.config.json` per auth mode:

```bash
AUTH_MODE=corporate npx tsx scripts/generate-swa-config.ts
AUTH_MODE=public PUBLIC_AUTH_PROVIDERS=google,github npx tsx scripts/generate-swa-config.ts
```

| Mode      | Route protection                                                  | Blocked providers                        | 401 redirect                     |
| --------- | ----------------------------------------------------------------- | ---------------------------------------- | -------------------------------- |
| Corporate | All routes require `authenticated`                                | github, twitter, google                  | `/.auth/login/aad`               |
| Public    | Management API routes require `authenticated`; `/{alias}` is open | Providers not in `PUBLIC_AUTH_PROVIDERS` | `/.auth/login/{primaryProvider}` |
| Dev       | No `allowedRoles` on any route                                    | None                                     | N/A                              |

---

## API Reference

All endpoints are Azure Functions v4 with `authLevel: "anonymous"` (auth is handled at the SWA and application layers).

### `GET /api/auth-config`

Returns the active authentication configuration. Unauthenticated.

**Response:**

```json
{
  "mode": "corporate",
  "identityProviders": ["aad"],
  "loginUrl": "/.auth/login/aad",
  "aliasPrefix": "go"
}
```

### `GET /api/links`

Returns all global aliases plus the authenticated user's private aliases.

**Query parameters:**

- `search` — case-insensitive substring match on alias and title
- `sort` — `"clicks"` or `"heat"`
- `scope` — `"popular"` returns top 10 global aliases by heat score

**Auth:** Required (401 if unauthenticated)

### `POST /api/links`

Creates a new alias record.

**Body:**

```json
{
  "alias": "my-link",
  "destination_url": "https://example.com/long-path",
  "title": "My Link Title",
  "is_private": false,
  "expiry_policy_type": "fixed",
  "duration_months": 12,
  "icon_url": "https://example.com/favicon.ico"
}
```

**Validation:**

- `alias`: required, lowercase alphanumeric + hyphens only
- `destination_url`: required, valid URL format
- `title`: required
- `expiry_policy_type`: `"never"`, `"fixed"`, or `"inactivity"`
- For `"fixed"`: provide either `duration_months` (1, 3, or 12) or `custom_expires_at` (ISO 8601 future date), not both

**Auth:** Required. Returns 409 if alias name conflicts with existing same-scope alias.

### `PUT /api/links/:alias`

Updates an existing alias record. Partial updates supported.

**Auth:** Required. Creator can update own; Admin can update any global; 403 for others' private aliases.

### `DELETE /api/links/:alias`

Deletes an alias record.

**Auth:** Required. Same authorization rules as update. Returns 204 on success.

### `PUT /api/links/:alias/renew`

Renews an expired or expiring alias by recalculating `expires_at` from the current policy.

**Auth:** Required. Same authorization rules as update.

### `GET /:alias` (Redirect)

Resolves an alias and performs a 302 redirect to the destination URL.

**Behavior:**

- Merges incoming query parameters into the destination (destination params take precedence for duplicates)
- Passes through URL fragments (destination fragment takes precedence)
- Updates analytics (click count, last accessed, heat score) on successful redirect
- Resets expiry for inactivity-policy aliases
- Returns interstitial redirect when both private and global aliases match
- Redirects to `/?suggest={alias}` when alias not found
- Redirects to `/?expired={alias}` when alias is expired

**Auth:** Mode-dependent (see [Redirect Endpoint Auth Branching](#redirect-endpoint-auth-branching))

### `GET /api/scrape-title?url={url}`

Fetches a URL and extracts the `<title>` tag and favicon URL. Unauthenticated utility endpoint. Returns empty strings on error. 5-second timeout.

### Timer: Expiry Processor

Runs daily at 2:00 AM UTC. Evaluates all aliases with an expiry policy and transitions them through the state machine (see [Expiry System](#expiry-system)).

---

## Data Model

### AliasRecord

| Field                | Type                                                      | Description                                              |
| -------------------- | --------------------------------------------------------- | -------------------------------------------------------- |
| `id`                 | `string`                                                  | Unique ID. Global: `{alias}`. Private: `{alias}:{email}` |
| `alias`              | `string`                                                  | The short link name (lowercase, alphanumeric + hyphens)  |
| `destination_url`    | `string`                                                  | Target URL                                               |
| `created_by`         | `string`                                                  | Creator's email address                                  |
| `title`              | `string`                                                  | Human-readable title                                     |
| `click_count`        | `number`                                                  | Total redirect count                                     |
| `heat_score`         | `number`                                                  | Popularity score with exponential decay                  |
| `heat_updated_at`    | `string \| null`                                          | ISO 8601 timestamp of last heat update                   |
| `is_private`         | `boolean`                                                 | Whether this is a personal alias                         |
| `created_at`         | `string`                                                  | ISO 8601 creation timestamp                              |
| `last_accessed_at`   | `string \| null`                                          | ISO 8601 timestamp of last redirect                      |
| `expiry_policy_type` | `"never" \| "fixed" \| "inactivity"`                      | Expiry policy                                            |
| `duration_months`    | `1 \| 3 \| 12 \| null`                                    | Fixed policy duration                                    |
| `custom_expires_at`  | `string \| null`                                          | Fixed policy custom date                                 |
| `expires_at`         | `string \| null`                                          | Computed expiration timestamp                            |
| `expiry_status`      | `"active" \| "expiring_soon" \| "expired" \| "no_expiry"` | Current state                                            |
| `expired_at`         | `string \| null`                                          | When the alias transitioned to expired                   |
| `icon_url`           | `string \| null`                                          | Favicon URL from destination                             |

### Cosmos DB Structure

- Database: `go-url-alias`
- Container: `aliases`
- Partition key: `alias` (the short link name)
- Point reads use composite key: `(alias, id)` where `id` is `{alias}` for global or `{alias}:{email}` for private

---

## Expiry System

### Policies

| Policy       | Behavior                                                                             |
| ------------ | ------------------------------------------------------------------------------------ |
| `never`      | Link never expires. `expires_at` is null.                                            |
| `fixed`      | Expires after a set duration (1, 3, or 12 months from creation) or at a custom date. |
| `inactivity` | Expires 12 months after last access. Each redirect resets the timer.                 |

### State Machine

The expiry processor (daily timer) transitions aliases through these states:

```
active → expiring_soon    (within 7 days of expires_at)
active → expired          (past expires_at)
expiring_soon → expired   (past expires_at)
expired → deleted         (14 days after expired_at — permanent deletion)
```

Inactivity-policy aliases reset `expires_at` to 12 months from now on each redirect, effectively keeping active links alive indefinitely.

---

## Heat Score and Popularity

Heat scores use lazy exponential decay with a 7-day (168-hour) half-life:

```
new_heat = old_heat × 2^(-hours_elapsed / 168) + 1.0
```

- Scores are only recalculated on redirect (lazy evaluation)
- A score below `1e-9` is clamped to zero before adding the increment
- The "Popular Links" section on the landing page shows the top 10 global aliases by heat score
- Heat bars in the UI show relative popularity as a percentage of the highest score

---

## Configuration Reference

### Environment Variables

| Variable                   | Required | Default         | Description                                                                               |
| -------------------------- | -------- | --------------- | ----------------------------------------------------------------------------------------- |
| `AUTH_MODE`                | Yes      | —               | `corporate`, `public`, or `dev`                                                           |
| `CORPORATE_LOCK`           | No       | `false`         | When `true`, only `corporate` mode is allowed                                             |
| `PUBLIC_AUTH_PROVIDERS`    | No       | `google`        | Comma-separated identity providers for public mode (`aad`, `google`, `github`, `twitter`) |
| `COSMOS_CONNECTION_STRING` | Yes\*    | —               | Cosmos DB connection string. \*Optional in dev mode (uses in-memory store).               |
| `DEV_USER_EMAIL`           | No       | `dev@localhost` | Mock email for dev mode                                                                   |
| `DEV_USER_ROLES`           | No       | `User`          | Comma-separated mock roles for dev mode                                                   |
| `ALIAS_PREFIX`             | No       | `go`            | Display prefix for aliases in the UI (e.g., `go/my-link`)                                 |

### Azure SWA App Settings

For corporate mode, also configure:

- `AAD_CLIENT_ID` — Azure AD application client ID
- `AAD_CLIENT_SECRET` — Azure AD application client secret
- `TENANT_ID` — Azure AD tenant ID (used in the SWA config `openIdIssuer` URL)

---

## Deployment

### Prerequisites

- Node.js 18+
- Azure Static Web Apps resource
- Azure Cosmos DB account (for corporate/public modes)
- Azure AD app registration (for corporate mode)

### Build

```bash
# Frontend
npm install
npm run build

# API
cd api
npm install
npm run build
```

### Generate SWA Config

Run before deployment to ensure route protections match the target mode:

```bash
AUTH_MODE=corporate npx tsx scripts/generate-swa-config.ts
```

This writes `staticwebapp.config.json` at the project root.

### Deploy

Deploy via the Azure SWA CLI, GitHub Actions, or Azure DevOps. The SWA resource should point to:

- App location: `/` (or wherever `dist/` is output)
- API location: `api/`
- Output location: `dist/`

### Corporate Deployment Checklist

1. Set `AUTH_MODE=corporate` and `CORPORATE_LOCK=true` in app settings
2. Set `COSMOS_CONNECTION_STRING` to your Cosmos DB connection string
3. Configure Azure AD app registration and set `AAD_CLIENT_ID`, `AAD_CLIENT_SECRET`
4. Run `generate-swa-config.ts` with `AUTH_MODE=corporate`
5. Verify `staticwebapp.config.json` blocks non-AAD providers and requires `authenticated` on all routes
6. Deploy

### Public Deployment Checklist

1. Set `AUTH_MODE=public` in app settings
2. Set `PUBLIC_AUTH_PROVIDERS` (e.g., `google,github`)
3. Set `COSMOS_CONNECTION_STRING`
4. Run `generate-swa-config.ts` with `AUTH_MODE=public`
5. Optionally set `ALIAS_PREFIX` if not using `go/`
6. Deploy

---

## Local Development

### Quick Start

```bash
# 1. Copy environment file
cp .env.example .env
# AUTH_MODE defaults to "dev" — no changes needed

# 2. Install dependencies
npm install
cd api && npm install && cd ..

# 3. Start the API (in-memory store, mock auth, seed data)
npm run dev:api

# 4. Start the frontend (in a separate terminal)
npm run dev
```

The Vite dev server proxies `/api` requests to the local Azure Functions host at `http://localhost:7071`.

### Dev Mode Behavior

- No external services required (no Cosmos DB, no Azure AD)
- In-memory store with 8 pre-loaded seed aliases
- Mock authentication: every request is treated as authenticated
- Override mock identity via headers: `x-mock-user-email`, `x-mock-user-roles`
- Override mock identity via env vars: `DEV_USER_EMAIL`, `DEV_USER_ROLES`

---

## Testing

### Test Stack

- **Vitest** — test runner for both frontend and API
- **fast-check** — property-based testing library
- **Testing Library** — React component testing
- **jsdom** — browser environment simulation

### Running Tests

```bash
# Frontend tests
npm test

# API tests
cd api && npm test
```

### Property-Based Tests

The codebase uses property-based testing (PBT) to validate correctness properties — universal invariants that must hold for all valid inputs. Each property test runs a minimum of 100 iterations with randomly generated inputs.

Key properties tested:

| Property                         | File                              | What It Validates                           |
| -------------------------------- | --------------------------------- | ------------------------------------------- |
| Strategy factory mode resolution | `auth-strategy.property.ts`       | Valid modes succeed, invalid modes throw    |
| SWA header identity round-trip   | `auth-strategy.property.ts`       | Encode → decode preserves email and roles   |
| Invalid header returns null      | `auth-strategy.property.ts`       | Malformed headers never produce an identity |
| Corporate lock enforcement       | `auth-strategy.property.ts`       | Lock blocks non-corporate modes             |
| Protected endpoint auth          | `protected-endpoints.property.ts` | Null identity always yields 401             |
| Redirect auth enforcement        | `redirect-auth.property.ts`       | Auth-required mode rejects unauthenticated  |
| Unauthenticated redirect scope   | `redirect-auth.property.ts`       | Only global aliases resolve without auth    |
| SWA config provider enablement   | `swa-config.property.ts`          | Enabled providers not blocked; others are   |
| SWA config 401 redirect          | `swa-config.property.ts`          | 401 redirect targets primary provider       |

### Unit Tests

Unit tests cover specific examples, edge cases, and integration points:

- Strategy factory error messages
- Auth config endpoint response shape per mode
- Redirect handler: interstitial, expired, not-found flows
- Expiry computation for all policy types
- Heat score decay calculations
- URL merge with query params and fragments
- Model validation (alias format, URL format, expiry policy rules)
- SWA config snapshot tests per mode
- Zero `DEV_MODE` references in API source (grep-based)

---

## Troubleshooting

### Startup Failures

| Error Message                                              | Cause                                                          | Fix                                                  |
| ---------------------------------------------------------- | -------------------------------------------------------------- | ---------------------------------------------------- |
| `CORPORATE_LOCK is enabled but AUTH_MODE is "..."`         | `CORPORATE_LOCK=true` with non-corporate mode                  | Set `AUTH_MODE=corporate` or remove `CORPORATE_LOCK` |
| `Invalid or missing AUTH_MODE: "..."`                      | `AUTH_MODE` not set or invalid value                           | Set to `corporate`, `public`, or `dev`               |
| `COSMOS_CONNECTION_STRING is required for AUTH_MODE="..."` | No connection string in corporate/public mode                  | Provide a valid Cosmos DB connection string          |
| `No strategy registered for AUTH_MODE "..."`               | Strategy not registered (shouldn't happen with built-in modes) | Check that `auth-strategy.ts` is imported            |
| `Storage not initialized`                                  | Data access called before `initStorage()`                      | Ensure `index.ts` startup sequence completes         |

### Common Issues

- **401 on all requests in dev mode**: Check that `AUTH_MODE=dev` is set in your `.env` file
- **Links show `go/` instead of custom prefix**: Set `ALIAS_PREFIX` in your environment and restart the API
- **SWA config doesn't match mode**: Re-run `generate-swa-config.ts` with the correct `AUTH_MODE`
- **Popular links empty**: Heat scores decay over time. Create new links or access existing ones to generate heat
- **Interstitial page not appearing**: Only triggers when both a private and global alias exist with the same name for the authenticated user
