# Expiry Processor Stale Status Bugfix Design

## Overview

The `expiryProcessor` timer trigger (`app.timer`) is silently unsupported on Azure Static Web Apps (SWA), which only supports HTTP triggers. Because the timer never fires, the `expiry_status` stored in the database is never updated after write time. Links that have passed their `expires_at` date continue to appear as `"active"` or `"expiring_soon"` when retrieved through `getLinks` and `redirect` endpoints.

The fix introduces read-time expiry status evaluation: a shared utility function `evaluateExpiryStatus` that recomputes `expiry_status` from `expires_at` and the current time. This function is applied to all records returned by `getLinks.ts` (including popular endpoints) and used by `redirect.ts` to determine expiry at redirect time, replacing reliance on the stored value. The existing `expiryProcessor` timer code is preserved for portability to platforms that support timer triggers.

## Glossary

- **Bug_Condition (C)**: A record has a non-null `expires_at` that is in the past or within 30 days, but the stored `expiry_status` does not reflect this (still reads `"active"` or `"expiring_soon"` when it should be `"expired"`, or `"active"` when it should be `"expiring_soon"`)
- **Property (P)**: The `expiry_status` returned to clients always matches the real-time evaluation of `expires_at` vs current time, regardless of the stored value
- **Preservation**: Records with `expiry_policy_type: "never"` or `expires_at: null` or `expires_at` more than 30 days in the future must have their `expiry_status` unchanged; all existing analytics, caching, and redirect behaviors must continue working
- **evaluateExpiryStatus**: A new shared utility function in `expiry-utils.ts` that takes an `AliasRecord` and optional `now: Date` and returns the record with a corrected `expiry_status` based on real-time evaluation
- **evaluateStatus**: The existing private helper in `expiry-utils.ts` that computes `expiry_status` and `expired_at` from an `expiresAtMs` timestamp and `now` — the core logic we will reuse
- **SWA**: Azure Static Web Apps — the deployment target that only supports HTTP triggers, causing the timer trigger to silently never fire

## Bug Details

### Bug Condition

The bug manifests when a record's `expires_at` timestamp is in the past or within 30 days of the current time, but the stored `expiry_status` field has not been updated to reflect this. Because the `expiryProcessor` timer never fires on SWA, the stored `expiry_status` is permanently stale after the initial write. The `getLinks` handler returns records verbatim from the database, and the `redirect` handler checks `expiry_status === "expired"` against the stored (stale) value.

**Formal Specification:**
```
FUNCTION isBugCondition(record, now)
  INPUT: record of type AliasRecord, now of type Date
  OUTPUT: boolean

  // Only applies to records with a concrete expiry date
  IF record.expires_at IS NULL OR record.expiry_policy_type = "never" THEN
    RETURN false
  END IF

  LET expiresAtMs = Date.parse(record.expires_at)
  LET nowMs = now.getTime()
  LET THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000

  // Case 1: Should be "expired" but stored status is not "expired"
  IF expiresAtMs <= nowMs AND record.expiry_status != "expired" THEN
    RETURN true
  END IF

  // Case 2: Should be "expiring_soon" but stored status is "active"
  IF expiresAtMs > nowMs AND (expiresAtMs - nowMs) <= THIRTY_DAYS_MS
     AND record.expiry_status = "active" THEN
    RETURN true
  END IF

  RETURN false
END FUNCTION
```

### Examples

- A link with `expires_at: "2025-01-15T00:00:00Z"` and `expiry_status: "active"` is retrieved on 2025-07-01. The stored status says "active" but the link expired 5+ months ago. The `getLinks` endpoint returns it as "active" and the `redirect` endpoint performs a redirect instead of showing the expired notice.
- A link with `expires_at: "2025-07-20T00:00:00Z"` and `expiry_status: "active"` is retrieved on 2025-07-10. The link expires in 10 days but the stored status says "active" instead of "expiring_soon". The UI shows no warning to the user.
- A link with `expiry_policy_type: "never"` and `expires_at: null` is retrieved. No bug — the stored `expiry_status: "no_expiry"` is correct and should not be modified.
- A link with `expires_at: "2026-06-01T00:00:00Z"` and `expiry_status: "active"` is retrieved on 2025-07-01. No bug — the link is 11 months from expiry, and "active" is correct.

## Expected Behavior

### Preservation Requirements

**Unchanged Behaviors:**
- Records with `expiry_policy_type: "never"` must continue to return `expiry_status: "no_expiry"` without modification
- Records with `expires_at` more than 30 days in the future and `expiry_status: "active"` must continue to return `expiry_status: "active"`
- The `expiryProcessor` timer trigger code must remain in `expiryProcessor.ts` so it functions on platforms that support timer triggers
- Redirect analytics side-effects (click_count, last_accessed_at, heat_score) and inactivity expiry resets must continue working for non-expired links
- Popular links endpoints (`scope=popular`, `scope=popular-clicks`) must continue to return results with appropriate cache headers
- Search endpoints must continue to return matching records with correct visibility rules
- The `evaluateStatus` helper's existing logic (30-day threshold, expired/expiring_soon/active classification) must not change

**Scope:**
All records where `expires_at` is null or `expiry_policy_type` is `"never"` should be completely unaffected by the read-time evaluation. Records where the stored `expiry_status` already matches the real-time evaluation should also pass through unchanged.

## Hypothesized Root Cause

Based on the bug description and code analysis, the root causes are:

1. **SWA Timer Trigger Limitation**: Azure Static Web Apps only supports HTTP triggers. The `app.timer("expiryProcessor", ...)` call in `expiryProcessor.ts` registers without error but the function is silently never invoked. This means the `expiry_status` field in the database is never updated after the initial write by `computeExpiry`.

2. **getLinks Returns Stored Values Verbatim**: The `getLinks.ts` handler calls `listAliasesForUser`, `searchAliases`, `getPopularGlobalAliases`, etc. and returns the results directly via `JSON.stringify(records)` without any post-processing. There is no read-time evaluation of `expiry_status`.

3. **redirect Trusts Stored expiry_status**: The `redirect.ts` handler checks `privateAlias?.expiry_status === "expired"` and `globalAlias?.expiry_status === "expired"` to determine if a link is expired. Since the stored value is stale, expired links are treated as active and redirected to their destination.

4. **Popular Links Queries Filter on Stored Status**: The Cosmos DB queries in `getPopularGlobalAliases` and `getPopularGlobalAliasesByClicks` use `WHERE c.expiry_status != 'expired'` — this filters on the stale stored value, so expired links can appear in popular results.

## Correctness Properties

Property 1: Bug Condition - Read-Time Expiry Evaluation Corrects Stale Status

_For any_ `AliasRecord` where `expires_at` is non-null and in the past relative to `now`, the `evaluateExpiryStatus` function SHALL return the record with `expiry_status` set to `"expired"`, regardless of the stored `expiry_status` value. Similarly, _for any_ record where `expires_at` is non-null and within 30 days of `now`, the function SHALL return `expiry_status` as `"expiring_soon"`.

**Validates: Requirements 2.1, 2.2, 2.3**

Property 2: Preservation - Non-Expirable and Future-Expiry Records Unchanged

_For any_ `AliasRecord` where `expiry_policy_type` is `"never"` or `expires_at` is null, the `evaluateExpiryStatus` function SHALL return the record with `expiry_status` unchanged. _For any_ record where `expires_at` is more than 30 days in the future, the function SHALL return `expiry_status` as `"active"`.

**Validates: Requirements 2.4, 3.1, 3.2**

Property 3: Bug Condition - Redirect Blocks Expired Links at Read Time

_For any_ `AliasRecord` where `expires_at` is non-null and in the past relative to `now`, the redirect handler SHALL treat the link as expired and redirect to the expired notice page, regardless of the stored `expiry_status` value.

**Validates: Requirements 2.3**

Property 4: Preservation - Redirect Analytics and Inactivity Reset Unchanged

_For any_ non-expired `AliasRecord` resolved by the redirect handler, the handler SHALL continue to increment `click_count`, update `last_accessed_at` and `heat_score`, and reset `expires_at` for inactivity-policy links, exactly as before the fix.

**Validates: Requirements 3.4**

Property 5: Bug Condition - getLinks Returns Corrected Status for All Scopes

_For any_ set of `AliasRecord` results returned by the database layer (including default listing, search, popular, and popular-clicks scopes), the `getLinks` handler SHALL apply read-time expiry evaluation to every record before returning the response, ensuring all `expiry_status` values reflect the current time.

**Validates: Requirements 2.1, 2.2**

## Fix Implementation

### Changes Required

Assuming our root cause analysis is correct:

**File**: `api/src/shared/expiry-utils.ts`

**Function**: New exported `evaluateExpiryStatus`

**Specific Changes**:
1. **Export the evaluateStatus helper** (or create a new wrapper): Add a new exported function `evaluateExpiryStatus(record: AliasRecord, now?: Date): AliasRecord` that takes a record and returns a shallow copy with corrected `expiry_status` and `expired_at` fields. If `expires_at` is null or `expiry_policy_type` is `"never"`, return the record unchanged. Otherwise, call the existing `evaluateStatus` logic to compute the correct status from `expires_at` and `now`.

2. **Add a batch helper**: Add `evaluateExpiryStatusBatch(records: AliasRecord[], now?: Date): AliasRecord[]` that maps `evaluateExpiryStatus` over an array of records, using a single `now` timestamp for consistency within a response.

---

**File**: `api/src/functions/getLinks.ts`

**Function**: `createGetLinksHandler` (the returned `getLinksHandler`)

**Specific Changes**:
3. **Import evaluateExpiryStatusBatch** from `expiry-utils.ts`.

4. **Apply to all return paths**: Before each `JSON.stringify(records)` call (there are 5 return paths: popular, popular-clicks, anonymous search, authenticated search, default listing), apply `evaluateExpiryStatusBatch(records)` to the records array. This ensures every record returned to the client has a correct `expiry_status`.

---

**File**: `api/src/functions/redirect.ts`

**Function**: `createRedirectHandler` (the returned `redirectHandler`)

**Specific Changes**:
5. **Import evaluateExpiryStatus** from `expiry-utils.ts`.

6. **Evaluate at read time**: After fetching `privateAlias` and `globalAlias` from the database, apply `evaluateExpiryStatus` to each before checking `expiry_status === "expired"`. Replace:
   ```
   const privateExpired = privateAlias?.expiry_status === "expired";
   const globalExpired = globalAlias?.expiry_status === "expired";
   ```
   with:
   ```
   if (privateAlias) privateAlias = evaluateExpiryStatus(privateAlias, now);
   if (globalAlias) globalAlias = evaluateExpiryStatus(globalAlias, now);
   const privateExpired = privateAlias?.expiry_status === "expired";
   const globalExpired = globalAlias?.expiry_status === "expired";
   ```
   The `now` variable is already defined in the handler.

---

**File**: `api/src/functions/expiryProcessor.ts`

**No changes**: The timer trigger code is preserved as-is for portability.

## Testing Strategy

### Validation Approach

The testing strategy follows a two-phase approach: first, surface counterexamples that demonstrate the bug on unfixed code, then verify the fix works correctly and preserves existing behavior.

### Exploratory Bug Condition Checking

**Goal**: Surface counterexamples that demonstrate the bug BEFORE implementing the fix. Confirm or refute the root cause analysis. If we refute, we will need to re-hypothesize.

**Test Plan**: Write tests that create AliasRecords with stale `expiry_status` values (e.g., `expiry_status: "active"` but `expires_at` in the past) and pass them through the `getLinks` and `redirect` handlers. Run these tests on the UNFIXED code to observe that the stale status is returned/used.

**Test Cases**:
1. **getLinks Stale Expired Test**: Create a record with `expires_at` in the past and `expiry_status: "active"`, call getLinks, verify the response still shows "active" (will demonstrate the bug on unfixed code)
2. **getLinks Stale Expiring Soon Test**: Create a record with `expires_at` within 30 days and `expiry_status: "active"`, call getLinks, verify the response still shows "active" (will demonstrate the bug on unfixed code)
3. **redirect Stale Expired Test**: Create a record with `expires_at` in the past and `expiry_status: "active"`, call redirect, verify it performs a redirect instead of showing expired notice (will demonstrate the bug on unfixed code)
4. **Popular Links Stale Test**: Create a record with `expires_at` in the past and `expiry_status: "active"`, call getLinks with scope=popular, verify the expired record appears in results (will demonstrate the bug on unfixed code)

**Expected Counterexamples**:
- getLinks returns records with `expiry_status: "active"` even when `expires_at` is in the past
- redirect performs a 302 to the destination URL for records that should be expired
- Possible causes: no read-time evaluation in getLinks, redirect trusts stored expiry_status

### Fix Checking

**Goal**: Verify that for all inputs where the bug condition holds, the fixed function produces the expected behavior.

**Pseudocode:**
```
FOR ALL record WHERE isBugCondition(record, now) DO
  result := evaluateExpiryStatus(record, now)
  IF record.expires_at <= now THEN
    ASSERT result.expiry_status = "expired"
  ELSE IF (record.expires_at - now) <= 30 days THEN
    ASSERT result.expiry_status = "expiring_soon"
  END IF
END FOR
```

### Preservation Checking

**Goal**: Verify that for all inputs where the bug condition does NOT hold, the fixed function produces the same result as the original function.

**Pseudocode:**
```
FOR ALL record WHERE NOT isBugCondition(record, now) DO
  ASSERT evaluateExpiryStatus(record, now).expiry_status = record.expiry_status
END FOR
```

**Testing Approach**: Property-based testing is recommended for preservation checking because:
- It generates many test cases automatically across the input domain (various expires_at values, policy types, stored statuses)
- It catches edge cases like records exactly at the 30-day boundary
- It provides strong guarantees that behavior is unchanged for all non-buggy inputs

**Test Plan**: Observe behavior on UNFIXED code first for records with correct stored status, then write property-based tests capturing that behavior.

**Test Cases**:
1. **Never-Policy Preservation**: Verify records with `expiry_policy_type: "never"` pass through with `expiry_status: "no_expiry"` unchanged
2. **Future-Expiry Preservation**: Verify records with `expires_at` more than 30 days out pass through with `expiry_status: "active"` unchanged
3. **Already-Correct Preservation**: Verify records where stored `expiry_status` already matches the real-time evaluation pass through unchanged
4. **Redirect Analytics Preservation**: Verify non-expired links still trigger click_count increment, last_accessed_at update, heat_score update, and inactivity reset

### Unit Tests

- Test `evaluateExpiryStatus` with a record whose `expires_at` is in the past → returns `"expired"`
- Test `evaluateExpiryStatus` with a record whose `expires_at` is within 30 days → returns `"expiring_soon"`
- Test `evaluateExpiryStatus` with a record whose `expires_at` is more than 30 days out → returns `"active"`
- Test `evaluateExpiryStatus` with a record whose `expiry_policy_type` is `"never"` → returns unchanged
- Test `evaluateExpiryStatus` with a record whose `expires_at` is null → returns unchanged
- Test `evaluateExpiryStatusBatch` applies evaluation to all records in array
- Test getLinks handler applies evaluation before returning response (mock DB returns stale records)
- Test redirect handler evaluates expiry before checking expired status

### Property-Based Tests

- Generate random AliasRecords with various `expires_at` values and stored `expiry_status` values, apply `evaluateExpiryStatus`, and verify the output status matches the real-time evaluation based on `expires_at` vs `now`
- Generate random AliasRecords with `expiry_policy_type: "never"` and verify `evaluateExpiryStatus` returns them unchanged
- Generate random AliasRecords with `expires_at` more than 30 days in the future and verify `evaluateExpiryStatus` returns `expiry_status: "active"`
- Generate random AliasRecords with stale status, mock them as DB results in getLinks, and verify the handler response contains corrected statuses
- Generate random AliasRecords with stale expired status, mock them in redirect, and verify the handler redirects to the expired notice page

### Integration Tests

- Test full getLinks flow: seed in-memory store with records having stale expiry_status, call the handler, verify response contains corrected statuses
- Test full redirect flow: seed in-memory store with a record that has `expires_at` in the past but `expiry_status: "active"`, call redirect, verify it redirects to expired notice
- Test popular links flow: seed in-memory store with a mix of expired and active records, call getLinks with scope=popular, verify expired records are correctly identified after read-time evaluation
