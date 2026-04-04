# Tasks

## Task 1: Update alias validation in models.ts

- [x] 1.1 Update `ALIAS_PATTERN` regex from `/^[a-z0-9-]+$/` to `/^[a-z0-9][a-z0-9-]*$/` to enforce alphanumeric first character
- [x] 1.2 Add `RESERVED_NAMES` constant set containing `"api"` and `"login"`
- [x] 1.3 Update `validateAlias()` to check reserved names before pattern check, returning "This alias name is reserved and cannot be used"
- [x] 1.4 Update `validateAlias()` pattern-fail error message to "Alias must start with a letter or digit and contain only lowercase alphanumeric characters and hyphens"
- [x] 1.5 Write unit tests for alias validation: reserved names, underscore/period/hyphen start, valid aliases
- [x] 1.6 Write property test for Property 6: alphanumeric start and valid character enforcement
- [x] 1.7 Write property test for Property 7: reserved name rejection

## Task 2: Update config generator for `/_/` prefix

- [x] 2.1 Update `pageRewrites()` in `generate-swa-config.ts` to return `/_/`-prefixed routes (`/_/manage`, `/_/interstitial`, `/_/kitchen-sink`)
- [x] 2.2 Update `baseNavigationFallback()` to include `/_/*` in the exclude array
- [x] 2.3 Regenerate `staticwebapp.config.json` by running the config generator
- [x] 2.4 Write property test for Property 1: generated config app routes use `/_/` prefix
- [x] 2.5 Write property test for Property 2: alias catch-all appears after all prefixed app routes
- [x] 2.6 Write property test for Property 3: navigationFallback excludes `/_/*`
- [x] 2.7 Write property test for Property 4: login route remains unprefixed

## Task 3: Update React Router and navigation links

- [x] 3.1 Update route definitions in `App.tsx` from `/manage`, `/interstitial`, `/kitchen-sink` to `/_/manage`, `/_/interstitial`, `/_/kitchen-sink`
- [x] 3.2 Update `NavLink` to Manage page from `/manage` to `/_/manage`
- [x] 3.3 Update `isManagePage` check from `/manage` to `/_/manage`
- [x] 3.4 Update `isAppRoute` array to use `/_/`-prefixed paths
- [x] 3.5 Update `handleHeaderSearch` and `handleHeaderSubmit` to navigate to `/_/manage?q=...`
- [x] 3.6 Update any other programmatic navigations or links referencing old paths

## Task 4: Update redirect API to use `/_/` base path

- [x] 4.1 Update interstitial redirect URL in `redirect.ts` from `/interstitial?...` to `/_/interstitial?...`
- [x] 4.2 Update suggest redirect URL from `/?suggest=...` to `/_/?suggest=...`
- [x] 4.3 Update expired redirect URL from `/?expired=...` to `/_/?expired=...`
- [x] 4.4 Update empty-alias fallback redirect from `/` to `/_/` (if applicable)
- [x] 4.5 Write property test for Property 5: redirect API fallback URLs use `/_/` base path
- [x] 4.6 Update existing redirect unit tests to expect `/_/`-prefixed URLs

## Task 5: Verify and update existing tests

- [x] 5.1 Update SWA config property tests (`swa-config.property.ts`) to expect `/_/`-prefixed routes
- [x] 5.2 Update SWA config unit tests (`swa-config.test.ts`) to expect `/_/`-prefixed routes
- [x] 5.3 Update redirect property tests (`redirect.property.ts`) to expect `/_/`-prefixed redirect URLs
- [x] 5.4 Update redirect unit tests (`redirect.test.ts`) to expect `/_/`-prefixed redirect URLs
- [x] 5.5 Update models property tests (`models.property.ts`) if they test alias validation
- [x] 5.6 Update models unit tests (`models.test.ts`) if they test alias validation
- [x] 5.7 Run full test suite and fix any remaining failures
