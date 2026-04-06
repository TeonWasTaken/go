# Alias Not Found Handling Bugfix Design

## Overview

When a user navigates to a non-existent alias, the redirect API (`api/src/functions/redirect.ts`) returns a 302 to `/_/not-found?suggest=<alias>`. However, the SWA config (`staticwebapp.config.json`) has no route for `/_/not-found` and the `navigationFallback` explicitly excludes `/_/*`, so Azure serves its default 404 page. The fix requires three coordinated changes: (1) add an SWA route for `/_/not-found` that rewrites to `index.html`, (2) add a React route and `NotFoundPage` component, and (3) read the `suggest` query param on the not-found page to pre-fill the create dialog for authenticated users. The `generate-swa-config.ts` script must also be updated so regenerated configs include the new route.

## Glossary

- **Bug_Condition (C)**: A navigation to a non-existent alias that results in a redirect to `/_/not-found?suggest=<alias>`, which the SWA platform cannot serve
- **Property (P)**: The `/_/not-found?suggest=<alias>` path is served by the frontend, showing a not-found page with an option to create the alias
- **Preservation**: All existing redirect, interstitial, manage, and landing page behaviors remain unchanged
- **redirect function**: The Azure Function in `api/src/functions/redirect.ts` that resolves aliases and returns 302 redirects
- **SWA config**: `staticwebapp.config.json` — the Azure Static Web Apps routing configuration
- **generate-swa-config.ts**: The script in `scripts/` that generates `staticwebapp.config.json` from auth mode settings
- **suggest param**: The `?suggest=<alias>` query parameter appended by the redirect function when no alias is found

## Bug Details

### Bug Condition

The bug manifests when a user navigates to any alias path (`/<alias>`) where the alias does not exist in the database. The redirect API correctly identifies the missing alias and redirects to `/_/not-found?suggest=<alias>`, but the SWA platform has no route to serve this path. The `navigationFallback` excludes `/_/*`, and no explicit route exists for `/_/not-found`.

**Formal Specification:**
```
FUNCTION isBugCondition(input)
  INPUT: input of type { path: string, aliasExists: boolean }
  OUTPUT: boolean

  alias := extractAlias(input.path)
  RETURN alias IS NOT NULL
         AND NOT input.aliasExists
         AND redirectTarget(alias) == "/_/not-found?suggest=<alias>"
         AND NOT swaCanServe("/_/not-found")
END FUNCTION
```

### Examples

- User navigates to `/my-cool-link` where `my-cool-link` does not exist → API redirects to `/_/not-found?suggest=my-cool-link` → Azure 404 page (expected: friendly not-found page or create dialog)
- User navigates to `/nonexistent` while unauthenticated → Azure 404 page (expected: "This alias is available" page)
- User navigates to `/claim-me` while authenticated → Azure 404 page (expected: not-found page with "Create it now" button pre-filling alias `claim-me`)
- User navigates to `/existing-alias` where alias exists → 302 to destination URL (not affected, works correctly)

## Expected Behavior

### Preservation Requirements

**Unchanged Behaviors:**
- Navigating to an existing alias continues to 302 redirect to the destination URL
- The interstitial page at `/_/interstitial` continues to resolve private/global conflicts
- The manage page at `/_/manage` continues to require authentication and display user links
- The landing page at `/` continues to show popular links and the create button
- Mouse clicks, search, and all other UI interactions remain unchanged
- The `/_/?expired=<alias>` redirect path behavior is unchanged (separate concern)
- The `/{alias}` → `/api/redirect/{alias}` SWA rewrite continues to work for all aliases

**Scope:**
All inputs that do NOT involve navigating to a non-existent alias are completely unaffected by this fix. This includes:
- Navigation to existing aliases (redirect works)
- Direct navigation to `/_/manage`, `/_/interstitial`, `/_/kitchen-sink`
- Landing page at `/`
- All API endpoints
- Authentication flows

## Hypothesized Root Cause

Based on the bug description, the root cause is a missing SWA route combined with a missing React route:

1. **Missing SWA Route for `/_/not-found`**: The `staticwebapp.config.json` has explicit routes for `/_/interstitial`, `/_/kitchen-sink`, and `/_/manage`, but no route for `/_/not-found`. The `navigationFallback` excludes `/_/*`, so `/_/not-found` is not caught by the fallback either. This means the SWA platform returns a 404 for `/_/not-found?suggest=<alias>`.

2. **Missing React Route for `/_/not-found`**: Even if the SWA route existed, the React Router in `App.tsx` has no `<Route>` for `/_/not-found`. The `Routes` component has `/`, `/_/manage`, `/_/interstitial`, `/_/kitchen-sink`, and a catch-all `/*`. The catch-all would treat `_/not-found` as an alias and redirect back to the API, creating a loop.

3. **generate-swa-config.ts Not Updated**: The `pageRewrites()` function in the config generator only emits routes for `/_/interstitial`, `/_/kitchen-sink`, and `/_/manage`. Any regeneration of the config would omit the new `/_/not-found` route.

4. **No Frontend Component for Not-Found**: There is no `NotFoundPage` component that reads the `suggest` query param and renders appropriate UI based on auth state.

## Correctness Properties

Property 1: Bug Condition - Non-existent alias shows frontend page

_For any_ navigation to a non-existent alias where the redirect API returns a 302 to `/_/not-found?suggest=<alias>`, the SWA platform SHALL serve `index.html` and the React app SHALL render a meaningful page: a not-found page for unauthenticated users, or the not-found page with a "Create it now" button pre-filled with the alias for authenticated users.

**Validates: Requirements 2.1, 2.2, 2.3**

Property 2: Preservation - Existing alias redirect behavior unchanged

_For any_ navigation to an existing alias, the redirect API SHALL continue to return a 302 to the alias's destination URL (or the interstitial page for conflicts), and no existing SWA routes, React routes, or UI behaviors SHALL be altered by this fix.

**Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 3.6**

## Fix Implementation

### Changes Required

Assuming our root cause analysis is correct:

**File**: `staticwebapp.config.json`

**Specific Changes**:
1. **Add `/_/not-found` route**: Add a route entry `{ "route": "/_/not-found", "rewrite": "/index.html" }` before the existing `/_/interstitial` route. This allows the SWA platform to serve the React app for the `/_/not-found?suggest=<alias>` redirect target.

**File**: `scripts/generate-swa-config.ts`

**Function**: `pageRewrites()`

**Specific Changes**:
2. **Add `/_/not-found` to generated routes**: Add `{ route: "/_/not-found", rewrite: "/index.html" }` to the `pageRewrites()` function so that all generated SWA configs (corporate, public, dev) include the new route.

**File**: `src/App.tsx`

**Specific Changes**:
3. **Add React route for `/_/not-found`**: Add a `<Route path="/_/not-found" element={<NotFoundPage />} />` entry in the `<Routes>` block. This route renders the new `NotFoundPage` component. Add `/_/not-found` to the `isAppRoute` array so the header is shown.

**File**: `src/components/NotFoundPage.tsx` (new file)

**Specific Changes**:
4. **Create NotFoundPage component**: Build a new component that:
   - Reads the `suggest` query param from the URL
   - If the user is authenticated: shows a "This alias is available" message with a "Create it now" button that opens `CreateEditModal` with the alias pre-filled
   - If the user is unauthenticated: shows the same "This alias is available" message with a "Create it now" button that redirects to sign-in first
   - If no `suggest` param is present: shows a generic not-found message

5. **Integrate with CreateEditModal**: Pass a pre-filled `record` prop (with `alias` set) to `CreateEditModal` when the user is authenticated and a `suggest` param is present. The modal already supports `record: null` for create mode, so we pass `null` but set initial alias state via a new optional `initialAlias` prop or by navigating to the manage page with appropriate state.

## Testing Strategy

### Validation Approach

The testing strategy follows a two-phase approach: first, surface counterexamples that demonstrate the bug on unfixed code, then verify the fix works correctly and preserves existing behavior.

### Exploratory Bug Condition Checking

**Goal**: Surface counterexamples that demonstrate the bug BEFORE implementing the fix. Confirm or refute the root cause analysis. If we refute, we will need to re-hypothesize.

**Test Plan**: Write tests that verify the SWA config routing and React route handling for the `/_/?suggest=<alias>` path. Run these tests on the UNFIXED code to observe failures.

**Test Cases**:
1. **SWA Config Missing Route Test**: Assert that `staticwebapp.config.json` contains a route for `/_/` that rewrites to `/index.html` (will fail on unfixed code)
2. **React Route Missing Test**: Assert that navigating to `/_/?suggest=foo` renders a component (not the catch-all `AliasRedirect`) (will fail on unfixed code)
3. **Config Generator Missing Route Test**: Assert that `pageRewrites()` includes a `/_/` route (will fail on unfixed code)

**Expected Counterexamples**:
- SWA config has no route matching `/_/`
- React Router falls through to the `/*` catch-all for `/_/` path
- `generate-swa-config.ts` `pageRewrites()` does not include `/_/`

### Fix Checking

**Goal**: Verify that for all inputs where the bug condition holds, the fixed system produces the expected behavior.

**Pseudocode:**
```
FOR ALL input WHERE isBugCondition(input) DO
  swaRoute := findMatchingRoute(swaConfig, "/_/")
  ASSERT swaRoute.rewrite == "/index.html"

  reactRoute := resolveReactRoute("/_/?suggest=" + input.alias)
  ASSERT reactRoute.component == NotFoundPage

  IF user IS authenticated THEN
    ASSERT createDialogShown(input.alias)
  ELSE
    ASSERT notFoundPageShown(input.alias)
  END IF
END FOR
```

### Preservation Checking

**Goal**: Verify that for all inputs where the bug condition does NOT hold, the fixed system produces the same result as the original system.

**Pseudocode:**
```
FOR ALL input WHERE NOT isBugCondition(input) DO
  ASSERT routeResolution_original(input) == routeResolution_fixed(input)
END FOR
```

**Testing Approach**: Property-based testing is recommended for preservation checking because:
- It generates many test cases automatically across the input domain
- It catches edge cases that manual unit tests might miss
- It provides strong guarantees that behavior is unchanged for all non-buggy inputs

**Test Plan**: Observe behavior on UNFIXED code first for existing routes (alias redirects, interstitial, manage, landing), then write property-based tests capturing that behavior.

**Test Cases**:
1. **Existing Alias Redirect Preservation**: Verify that navigating to an existing alias still produces a 302 to the destination URL
2. **Interstitial Route Preservation**: Verify that `/_/interstitial` continues to rewrite to `index.html` and render the interstitial component
3. **Manage Route Preservation**: Verify that `/_/manage` continues to require authentication and rewrite to `index.html`
4. **Landing Page Preservation**: Verify that `/` continues to render the landing page
5. **SWA Config Structure Preservation**: Verify that all existing routes in the SWA config remain unchanged after adding the new route

### Unit Tests

- Test `NotFoundPage` renders not-found message for unauthenticated users with `suggest` param
- Test `NotFoundPage` opens create dialog for authenticated users with `suggest` param
- Test `NotFoundPage` renders generic message when no `suggest` param is present
- Test SWA config contains `/_/` route with correct rewrite
- Test `generate-swa-config.ts` `pageRewrites()` includes `/_/` route

### Property-Based Tests

- Generate random alias strings and verify the SWA config routes `/_/not-found?suggest=<alias>` to `index.html` for all of them
- Generate random SWA config modes (corporate, public, dev) and verify all generated configs include the `/_/not-found` route
- Generate random existing route paths and verify none are affected by the addition of the `/_/` route

### Integration Tests

- Test full flow: navigate to non-existent alias → API redirect → SWA serves frontend → NotFoundPage renders
- Test authenticated flow: navigate to non-existent alias → create dialog opens with alias pre-filled
- Test unauthenticated flow: navigate to non-existent alias → not-found page with sign-in prompt
