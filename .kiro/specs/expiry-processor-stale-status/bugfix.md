# Bugfix Requirements Document

## Introduction

Links that have passed their `expires_at` date continue to appear as `"active"` (or `"expiring_soon"`) when retrieved through the `getLinks` and `redirect` endpoints. The read paths (`getLinks.ts`, `redirect.ts`) return the stored `expiry_status` field verbatim without re-evaluating it against the current time.

The primary root cause is that the application is deployed as an Azure Static Web App (SWA) with managed functions, and SWA managed functions only support HTTP triggers. The `expiryProcessor` timer trigger (`app.timer("expiryProcessor", { schedule: "0 0 2 * * *", ... })`) registers without error but is silently ignored by the SWA runtime — it never fires. This is a documented SWA limitation: "Triggers and bindings are limited to HTTP" (see [Azure SWA docs](https://learn.microsoft.com/en-us/azure/static-web-apps/apis-functions) and [Azure/static-web-apps#389](https://github.com/Azure/static-web-apps/issues/389)). Evidence is confirmed by `staticwebapp.config.json` with `platform.apiRuntime: "node:20"`, which is SWA-specific configuration.

Because the timer never fires, the `expiry_status` stored in the database is never updated after write time. Users see stale expiry data indefinitely — not just for up to ~23 hours as originally assumed. The fix must ensure read-time expiry status evaluation so that records returned to clients always reflect the correct status based on the current time and the record's `expires_at` value, without depending on the timer trigger.

## Bug Analysis

### Current Behavior (Defect)

1.1 WHEN the application is deployed as an Azure Static Web App with managed functions THEN the `expiryProcessor` timer trigger is silently unsupported and never fires, leaving all `expiry_status` values permanently stale after initial write

1.2 WHEN a link's `expires_at` is in the past AND the `expiryProcessor` timer has not fired (which in SWA is always) THEN the system returns `expiry_status` as `"active"` or `"expiring_soon"` instead of `"expired"` from the `getLinks` endpoint

1.3 WHEN a link's `expires_at` is within 30 days from now AND the `expiryProcessor` timer has not fired (which in SWA is always) THEN the system returns `expiry_status` as `"active"` instead of `"expiring_soon"` from the `getLinks` endpoint

1.4 WHEN a link's `expires_at` is in the past AND the `expiryProcessor` timer has not fired (which in SWA is always) THEN the `redirect` endpoint treats the link as non-expired and performs a redirect instead of redirecting to the expired notice page

1.5 WHEN the `expiryProcessor` timer trigger is registered via `app.timer()` in the SWA managed functions runtime THEN the registration succeeds silently but the function is never invoked, providing no error or warning to operators

1.6 WHEN the system relies solely on the `expiryProcessor` timer for expiry status transitions THEN there is no fallback mechanism to correct stale `expiry_status` values, leaving them stale indefinitely in the SWA deployment

### Expected Behavior (Correct)

2.1 WHEN a link's `expires_at` is in the past THEN the `getLinks` endpoint SHALL return `expiry_status` as `"expired"` regardless of whether the `expiryProcessor` has run, by evaluating expiry status at read time

2.2 WHEN a link's `expires_at` is within 30 days from now AND the stored `expiry_status` is `"active"` THEN the `getLinks` endpoint SHALL return `expiry_status` as `"expiring_soon"` regardless of whether the `expiryProcessor` has run, by evaluating expiry status at read time

2.3 WHEN a link's `expires_at` is in the past THEN the `redirect` endpoint SHALL treat the link as expired and redirect to the expired notice page, regardless of the stored `expiry_status` value, by evaluating expiry status at read time

2.4 WHEN a link has `expiry_policy_type` of `"never"` or `expires_at` is `null` THEN the read-time evaluation SHALL leave `expiry_status` unchanged (i.e., `"no_expiry"` or `"active"`)

2.5 WHEN the application is deployed on Azure Static Web Apps THEN the system SHALL NOT depend on timer triggers for expiry status correctness; read-time evaluation SHALL be the authoritative source of truth for expiry status

### Unchanged Behavior (Regression Prevention)

3.1 WHEN a link's `expires_at` is more than 30 days in the future AND `expiry_status` is `"active"` THEN the system SHALL CONTINUE TO return `expiry_status` as `"active"` from all endpoints

3.2 WHEN a link has `expiry_policy_type` of `"never"` THEN the system SHALL CONTINUE TO return `expiry_status` as `"no_expiry"` without any read-time modification

3.3 WHEN the `expiryProcessor` timer code exists THEN the system SHALL CONTINUE TO include the timer-based processing logic so that it functions correctly if the deployment target changes to a platform that supports timer triggers (e.g., standalone Azure Functions)

3.4 WHEN the `redirect` endpoint resolves a non-expired link THEN the system SHALL CONTINUE TO perform analytics side-effects (click_count, last_accessed_at, heat_score) and inactivity expiry resets

3.5 WHEN the `getLinks` endpoint is called with `scope=popular` or `scope=popular-clicks` THEN the system SHALL CONTINUE TO return popular links with appropriate cache headers
