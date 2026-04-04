# Requirements Document

## Introduction

This feature namespaces all application routes under a `/_/` prefix to eliminate ambiguity between SPA page routes and the `/{alias}` catch-all redirect route in Azure Static Web Apps. Currently, app routes like `/manage`, `/interstitial`, and `/kitchen-sink` must be individually listed as SWA rewrite rules before the `/{alias}` catch-all, creating a fragile configuration where SWA may incorrectly route app pages to the redirect API. By moving all app routes under `/_/`, the SWA config becomes a simple two-tier system: `/_/*` serves the SPA, and everything else (except `/api/*` and `/.auth/*`) is an alias redirect.

Additionally, alias name validation is tightened so that aliases must start with an alphanumeric character, preventing any alias from colliding with reserved prefixes (`_`, `.`) or reserved system names (`api`, `login`).

## Glossary

- **SPA**: The React single-page application served from `index.html`
- **SWA**: Azure Static Web Apps, the hosting platform
- **SWA_Config**: The `staticwebapp.config.json` file that defines route rules for SWA
- **Config_Generator**: The `scripts/generate-swa-config.ts` script that produces the SWA_Config
- **React_Router**: The client-side router (`react-router-dom`) that handles SPA navigation
- **Alias**: A short name (e.g., `my-link`) that redirects to a destination URL
- **App_Route**: A route serving an SPA page (e.g., `/_/manage`, `/_/kitchen-sink`)
- **Redirect_Route**: The `/{alias}` catch-all route that rewrites to `/api/redirect/{alias}`
- **Alias_Validator**: The validation logic in `api/src/shared/models.ts` that checks alias format
- **Vite_Proxy**: The development proxy configuration in `vite.config.ts`
- **Reserved_Prefix**: A URL path prefix reserved by the platform or application (`/_/`, `/.auth/`, `/api/`)
- **Reserved_Name**: An exact alias name that is blocked because it conflicts with system routes (e.g., `api`, `login`)

## Requirements

### Requirement 1: SWA Route Prefix for App Pages

**User Story:** As a developer, I want all SPA page routes served under the `/_/` prefix in the SWA config, so that app routes never conflict with the alias redirect catch-all.

#### Acceptance Criteria

1. THE SWA_Config SHALL define App_Route rewrite rules with the `/_/` prefix (i.e., `/_/manage`, `/_/interstitial`, `/_/kitchen-sink`) that rewrite to `/index.html`
2. THE SWA_Config SHALL define the Redirect_Route `/{alias}` rewrite to `/api/redirect/{alias}` after all `/_/` prefixed App_Route rules
3. THE SWA_Config SHALL retain the existing `/api/*` and `/.auth/*` route rules without modification
4. THE SWA_Config SHALL define a `/login` route that redirects to the appropriate `/.auth/login/` provider endpoint without the `/_/` prefix

### Requirement 2: Config Generator Update

**User Story:** As a developer, I want the SWA config generator script to produce `/_/`-prefixed app routes, so that generated configs are consistent with the new routing scheme.

#### Acceptance Criteria

1. THE Config_Generator SHALL produce App_Route rewrite rules using the `/_/` prefix for all SPA page routes (`/_/manage`, `/_/interstitial`, `/_/kitchen-sink`)
2. THE Config_Generator SHALL produce the Redirect_Route `/{alias}` rewrite after all `/_/` prefixed App_Route rules in every auth mode (corporate, public, dev)
3. THE Config_Generator SHALL include `/_/*` in the `navigationFallback.exclude` array alongside `/api/*` and `/.auth/*`

### Requirement 3: React Router Prefix Migration

**User Story:** As a user, I want the SPA to serve all pages under `/_/` paths, so that navigating to `/_/manage` renders the Manage page correctly.

#### Acceptance Criteria

1. THE React_Router SHALL define routes for `/_/manage`, `/_/interstitial`, and `/_/kitchen-sink` that render the corresponding page components
2. THE React_Router SHALL define the root route `/` that renders the Landing page without the `/_/` prefix
3. THE React_Router SHALL define a catch-all route `/*` that triggers the alias redirect logic for paths not matching any App_Route
4. WHEN a user navigates to an old unprefixed path (e.g., `/manage`), THE React_Router SHALL treat the path as an alias and trigger the redirect logic (no explicit redirect from old paths is required)

### Requirement 4: Internal Navigation Link Updates

**User Story:** As a user, I want all in-app navigation links to point to `/_/`-prefixed paths, so that clicking links within the SPA navigates correctly.

#### Acceptance Criteria

1. THE SPA SHALL use `/_/manage` as the target for all navigation links and programmatic navigations to the Manage page
2. THE SPA SHALL use `/_/` as the base path for constructing App_Route URLs in search handlers and redirect logic
3. WHEN the redirect API returns an interstitial redirect, THE redirect API SHALL use `/_/interstitial` as the interstitial page URL
4. WHEN the redirect API returns an expired or suggest redirect, THE redirect API SHALL use `/_/` as the base redirect path (e.g., `/_/?expired=...`, `/_/?suggest=...`)

### Requirement 5: Alias Name Validation — Alphanumeric Start

**User Story:** As a developer, I want alias names to start with an alphanumeric character, so that aliases can never collide with reserved prefixes like `_` or `.`.

#### Acceptance Criteria

1. THE Alias_Validator SHALL require alias names to start with a lowercase alphanumeric character (`a-z` or `0-9`)
2. THE Alias_Validator SHALL allow alias names to contain lowercase alphanumeric characters and hyphens after the first character
3. THE Alias_Validator SHALL reject alias names that start with a hyphen, underscore, or period
4. IF an alias name fails the alphanumeric-start validation, THEN THE Alias_Validator SHALL return the error message: "Alias must start with a letter or digit and contain only lowercase alphanumeric characters and hyphens"

### Requirement 6: Alias Name Validation — Reserved Names

**User Story:** As a developer, I want certain alias names to be blocked, so that aliases cannot shadow system routes.

#### Acceptance Criteria

1. THE Alias_Validator SHALL reject alias names that exactly match any Reserved_Name: `api`, `login`
2. THE Alias_Validator SHALL reject alias names that start with an underscore character
3. THE Alias_Validator SHALL reject alias names that start with a period character
4. IF an alias name matches a Reserved_Name, THEN THE Alias_Validator SHALL return the error message: "This alias name is reserved and cannot be used"

### Requirement 7: Vite Dev Proxy Update

**User Story:** As a developer, I want the Vite dev proxy to correctly handle the `/_/` prefix during local development, so that the dev experience matches production routing.

#### Acceptance Criteria

1. THE Vite_Proxy SHALL continue to proxy `/api` requests to the local Azure Functions host at `http://localhost:7071`
2. THE Vite_Proxy SHALL continue to proxy `/go-redirect` requests to the local Azure Functions host for alias redirect testing in development
3. WHEN a request is made to a `/_/` prefixed path during development, THE Vite dev server SHALL serve the SPA (via the default Vite SPA fallback behavior) without requiring additional proxy configuration

### Requirement 8: Redirect API Interstitial URL Update

**User Story:** As a user, I want the redirect API to send me to the correct `/_/interstitial` page when a private and global alias conflict, so that the interstitial page loads correctly.

#### Acceptance Criteria

1. WHEN both a private and global alias match for the same alias name, THE redirect API SHALL redirect to `/_/interstitial` with the appropriate query parameters (`alias`, `privateUrl`, `globalUrl`)
2. WHEN no alias is found, THE redirect API SHALL redirect to `/_/?suggest={alias}`
3. WHEN all matching aliases are expired, THE redirect API SHALL redirect to `/_/?expired={alias}`
