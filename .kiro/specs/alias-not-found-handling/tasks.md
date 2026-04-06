# Implementation Plan

## Overview

Fix the missing `/_/not-found` route that causes Azure's default 404 page when navigating to a non-existent alias. The redirect API correctly sends a 302 to `/_/not-found?suggest=<alias>`, but neither the SWA config nor the React router handle this path. The fix adds the SWA route, the React route, a `NotFoundPage` component, and updates the config generator script.

## Tasks

- [x] 1. Write bug condition exploration test
  - **Property 1: Bug Condition** - Non-existent alias path not served by SWA or React
  - **CRITICAL**: This test MUST FAIL on unfixed code — failure confirms the bug exists
  - **DO NOT attempt to fix the test or the code when it fails**
  - **NOTE**: This test encodes the expected behavior — it will validate the fix when it passes after implementation
  - **GOAL**: Surface counterexamples that demonstrate the bug exists
  - **Scoped PBT Approach**: Scope the property to the concrete failing cases:
    1. `staticwebapp.config.json` has no route for `/_/not-found` that rewrites to `/index.html`
    2. `generateSwaConfig()` output (for all auth modes) has no `/_/not-found` route
    3. React Router in `App.tsx` has no `<Route>` for `/_/not-found` (the `/*` catch-all would redirect back to the API, creating a loop)
  - Write property-based test in `api/tests/property/alias-not-found.property.ts` using fast-check:
    - For all auth modes (`corporate`, `public`, `dev`), assert `generateSwaConfig(mode, providers)` includes a route `{ route: "/_/not-found", rewrite: "/index.html" }`
    - Assert the committed `staticwebapp.config.json` contains a `/_/not-found` route with rewrite to `/index.html`
  - Run test on UNFIXED code
  - **EXPECTED OUTCOME**: Test FAILS (this is correct — it proves the bug exists)
  - Document counterexamples found (e.g., "no route matching `/_/not-found` in any generated config")
  - Mark task complete when test is written, run, and failure is documented
  - _Requirements: 1.1, 1.2, 1.3, 2.1, 2.2, 2.3_

- [x] 2. Write preservation property tests (BEFORE implementing fix)
  - **Property 2: Preservation** - Existing routes and behaviors unchanged
  - **IMPORTANT**: Follow observation-first methodology
  - **Observe on UNFIXED code**:
    - `generateSwaConfig("corporate", ["aad"])` includes routes for `/_/interstitial`, `/_/kitchen-sink`, `/_/manage` with rewrite to `/index.html`
    - `generateSwaConfig("public", providers)` includes `/{alias}` rewrite to `/api/redirect/{alias}` after all `/_/` routes
    - `navigationFallback.exclude` contains `/_/*`, `/api/*`, `/.auth/*` for all modes
    - The committed `staticwebapp.config.json` has existing routes for `/_/interstitial`, `/_/kitchen-sink`, `/_/manage`, and `/{alias}`
  - Write property-based test in `api/tests/property/alias-not-found.property.ts`:
    - For all auth modes: existing page rewrite routes (`/_/interstitial`, `/_/kitchen-sink`, `/_/manage`) still present with correct rewrites
    - For all auth modes: `/{alias}` catch-all appears after all `/_/`-prefixed routes
    - For all auth modes: `navigationFallback.exclude` still contains `/_/*`
    - The `/_/manage` route still has `allowedRoles: ["authenticated"]` in corporate and public modes
  - Run tests on UNFIXED code
  - **EXPECTED OUTCOME**: Tests PASS (this confirms baseline behavior to preserve)
  - Mark task complete when tests are written, run, and passing on unfixed code
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6_

- [x] 3. Fix for non-existent alias showing Azure 404 instead of frontend page

  - [x] 3.1 Add `/_/not-found` route to `staticwebapp.config.json`
    - Add `{ "route": "/_/not-found", "rewrite": "/index.html" }` before the existing `/_/interstitial` route
    - This allows the SWA platform to serve the React app for `/_/not-found?suggest=<alias>`
    - _Bug_Condition: isBugCondition(input) where swaCanServe("/_/not-found") is false_
    - _Expected_Behavior: swaConfig.routes includes { route: "/_/not-found", rewrite: "/index.html" }_
    - _Preservation: All existing routes remain unchanged_
    - _Requirements: 1.3, 2.3_

  - [x] 3.2 Add `/_/not-found` to `pageRewrites()` in `scripts/generate-swa-config.ts`
    - Add `{ route: "/_/not-found", rewrite: "/index.html" }` as the first entry in the `pageRewrites()` return array
    - This ensures all generated configs (corporate, public, dev) include the new route
    - _Bug_Condition: generateSwaConfig(mode).routes has no entry for "/_/not-found"_
    - _Expected_Behavior: pageRewrites() returns array including { route: "/_/not-found", rewrite: "/index.html" }_
    - _Preservation: Existing pageRewrites entries unchanged_
    - _Requirements: 1.3, 2.3_

  - [x] 3.3 Create `src/components/NotFoundPage.tsx`
    - Read `suggest` query param from URL via `useSearchParams()`
    - If user is authenticated (via `useUser()`): show "This alias is available" message with a "Create it now" button that opens `CreateEditModal` with alias pre-filled
    - If user is unauthenticated: show same message with a "Create it now" button that redirects to sign-in first
    - If no `suggest` param: show generic not-found message
    - _Expected_Behavior: NotFoundPage renders appropriate UI based on auth state and suggest param_
    - _Requirements: 2.1, 2.2_

  - [x] 3.4 Add React route for `/_/not-found` in `src/App.tsx`
    - Import `NotFoundPage` component
    - Add `<Route path="/_/not-found" element={<NotFoundPage />} />` before the `/*` catch-all
    - Add `"/_/not-found"` to the `isAppRoute` array so the header is shown on the not-found page
    - _Bug_Condition: React Router falls through to /* catch-all for /_/not-found path_
    - _Expected_Behavior: /_/not-found path renders NotFoundPage component with app header_
    - _Preservation: All existing routes (/, /_/manage, /_/interstitial, /_/kitchen-sink, /*) unchanged_
    - _Requirements: 2.1, 2.2, 2.3_

  - [x] 3.5 Verify bug condition exploration test now passes
    - **Property 1: Expected Behavior** - Non-existent alias path served by SWA and React
    - **IMPORTANT**: Re-run the SAME test from task 1 — do NOT write a new test
    - The test from task 1 encodes the expected behavior
    - When this test passes, it confirms the expected behavior is satisfied
    - Run bug condition exploration test from step 1
    - **EXPECTED OUTCOME**: Test PASSES (confirms bug is fixed)
    - _Requirements: 1.1, 1.2, 1.3, 2.1, 2.2, 2.3_
  - [x] 3.6 Verify preservation tests still pass
    - **Property 2: Preservation** - Existing routes and behaviors unchanged
    - **IMPORTANT**: Re-run the SAME tests from task 2 — do NOT write new tests
    - Run preservation property tests from step 2
    - **EXPECTED OUTCOME**: Tests PASS (confirms no regressions)
    - Confirm all tests still pass after fix (no regressions)

- [x] 4. Checkpoint - Ensure all tests pass
  - Run full test suite (`npm test` in root and `cd api && npm test`)
  - Ensure all property tests, unit tests, and existing tests pass
  - Ask the user if questions arise
