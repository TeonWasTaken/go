# Bugfix Requirements Document

## Introduction

When a user navigates to a non-existent alias (e.g., `/my-nonexistent-link`), the application shows Azure's default 404 page instead of a meaningful user experience. This happens because the redirect API function returns a 302 to `/_/?suggest=<alias>`, but the `/_/` base path is not routed to the frontend — the SWA config has explicit routes for `/_/interstitial`, `/_/kitchen-sink`, and `/_/manage`, but not for `/_/` itself, and the `navigationFallback` explicitly excludes `/_/*`.

The expected behavior depends on authentication state:
- Unauthenticated users should see a friendly "this link does not exist" page
- Authenticated users should be taken to the create dialog with the alias pre-filled so they can claim it

## Bug Analysis

### Current Behavior (Defect)

1.1 WHEN an unauthenticated user navigates to a non-existent alias (e.g., `/foo-bar` where `foo-bar` does not exist in the database) THEN the system redirects to `/_/?suggest=foo-bar` which results in Azure's default 404 page because `/_/` has no SWA route and is excluded from the navigation fallback

1.2 WHEN an authenticated user navigates to a non-existent alias THEN the system redirects to `/_/?suggest=<alias>` which also results in Azure's default 404 page, failing to offer the user the ability to create the alias

1.3 WHEN the redirect API returns a 302 to `/_/?suggest=<alias>` THEN the SWA platform cannot serve the response because `/_/` is not mapped to any route or rewrite rule in `staticwebapp.config.json`

### Expected Behavior (Correct)

2.1 WHEN an unauthenticated user navigates to a non-existent alias THEN the system SHALL display a user-friendly "Sorry, this link does not exist" page within the application UI

2.2 WHEN an authenticated user navigates to a non-existent alias THEN the system SHALL navigate to the create dialog with the alias name pre-filled, allowing the user to claim the alias

2.3 WHEN the redirect API determines an alias does not exist THEN the system SHALL route the response through a path that is properly handled by the SWA configuration and served by the frontend application

### Unchanged Behavior (Regression Prevention)

3.1 WHEN a user navigates to an existing alias THEN the system SHALL CONTINUE TO redirect to the alias's destination URL via 302

3.2 WHEN a user navigates to an alias that exists as both a private and global link THEN the system SHALL CONTINUE TO show the interstitial conflict resolution page

3.3 WHEN a user navigates to an expired alias THEN the system SHALL CONTINUE TO redirect to `/_/?expired=<alias>` (note: this path has the same routing gap but is a separate concern)

3.4 WHEN a user visits the landing page at `/` THEN the system SHALL CONTINUE TO display the landing page with popular links and the create button

3.5 WHEN a user visits `/_/manage` THEN the system SHALL CONTINUE TO display the manage page for authenticated users

3.6 WHEN a user visits `/_/interstitial` THEN the system SHALL CONTINUE TO display the interstitial conflict resolution page
