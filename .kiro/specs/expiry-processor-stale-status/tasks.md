# Implementation Plan

- [x] 1. Write bug condition exploration test
  - **Property 1: Bug Condition** - Read-Time Expiry Evaluation Corrects Stale Status
  - **CRITICAL**: This test MUST FAIL on unfixed code - failure confirms the bug exists
  - **DO NOT attempt to fix the test or the code when it fails**
  - **NOTE**: This test encodes the expected behavior - it will validate the fix when it passes after implementation
  - **GOAL**: Surface counterexamples that demonstrate the bug exists
  - **Scoped PBT Approach**: Generate `AliasRecord` values where `isBugCondition(record, now)` is true:
    - Case 1: `expires_at` is in the past AND stored `expiry_status` is not `"expired"` → assert `evaluateExpiryStatus` returns `"expired"`
    - Case 2: `expires_at` is within 30 days of `now` AND stored `expiry_status` is `"active"` → assert `evaluateExpiryStatus` returns `"expiring_soon"`
  - Write property-based test in `api/tests/property/expiry-processor-stale-status.property.ts`
  - Use `fast-check` to generate records with stale `expiry_status` values and various `expires_at` timestamps
  - Import `evaluateExpiryStatus` from `api/src/shared/expiry-utils.ts` (function does not exist yet — test will fail to compile or fail at runtime)
  - Run test on UNFIXED code
  - **EXPECTED OUTCOME**: Test FAILS (import error or incorrect status returned — this proves the bug exists)
  - Document counterexamples found to understand root cause
  - Mark task complete when test is written, run, and failure is documented
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 2.1, 2.2, 2.3_

- [x] 2. Write preservation property tests (BEFORE implementing fix)
  - **Property 2: Preservation** - Non-Expirable and Future-Expiry Records Unchanged
  - **IMPORTANT**: Follow observation-first methodology
  - Observe behavior on UNFIXED code for non-buggy inputs:
    - Observe: Records with `expiry_policy_type: "never"` have `expiry_status: "no_expiry"` — unchanged
    - Observe: Records with `expires_at` more than 30 days in the future have `expiry_status: "active"` — unchanged
    - Observe: Records where stored `expiry_status` already matches real-time evaluation pass through unchanged
  - Write property-based test in `api/tests/property/expiry-processor-stale-status.property.ts`:
    - For all records where `expiry_policy_type` is `"never"`, assert `evaluateExpiryStatus` returns `expiry_status: "no_expiry"` unchanged
    - For all records where `expires_at` is null, assert `evaluateExpiryStatus` returns the record with `expiry_status` unchanged
    - For all records where `expires_at` is more than 30 days in the future, assert `evaluateExpiryStatus` returns `expiry_status: "active"`
    - For all records where stored `expiry_status` already matches the real-time evaluation, assert `evaluateExpiryStatus` returns the same status
  - Since `evaluateExpiryStatus` does not exist yet on unfixed code, these tests will also fail to compile initially — that is expected
  - Verify tests PASS on UNFIXED code once the utility function exists but BEFORE the getLinks/redirect integration
  - _Requirements: 2.4, 3.1, 3.2_

- [x] 3. Implement the fix

  - [x] 3.1 Create `evaluateExpiryStatus` and `evaluateExpiryStatusBatch` in `api/src/shared/expiry-utils.ts`
    - Add exported function `evaluateExpiryStatus(record: AliasRecord, now?: Date): AliasRecord`
      - If `expires_at` is null or `expiry_policy_type` is `"never"`, return the record unchanged
      - Otherwise, call the existing `evaluateStatus` helper to compute the correct `expiry_status` and `expired_at` from `expires_at` vs `now`
      - Return a shallow copy of the record with corrected `expiry_status` and `expired_at`
    - Add exported function `evaluateExpiryStatusBatch(records: AliasRecord[], now?: Date): AliasRecord[]`
      - Map `evaluateExpiryStatus` over the array using a single `now` timestamp for consistency
    - Reuse the existing `evaluateStatus` private helper (30-day threshold logic) — do NOT duplicate it
    - _Bug_Condition: isBugCondition(record, now) where expires_at is non-null and in the past or within 30 days, but stored expiry_status does not reflect this_
    - _Expected_Behavior: evaluateExpiryStatus returns record with expiry_status matching real-time evaluation of expires_at vs now_
    - _Preservation: Records with expiry_policy_type "never" or expires_at null are returned unchanged_
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 3.1, 3.2_

  - [x] 3.2 Integrate read-time evaluation into `api/src/functions/getLinks.ts`
    - Import `evaluateExpiryStatusBatch` from `../shared/expiry-utils.js`
    - Apply `evaluateExpiryStatusBatch(records)` before `JSON.stringify(records)` in all 5 return paths:
      1. `scope=popular` path
      2. `scope=popular-clicks` path
      3. Anonymous search path
      4. Authenticated search path
      5. Default listing path
    - _Bug_Condition: getLinks returns stored expiry_status verbatim without re-evaluating against current time_
    - _Expected_Behavior: All records returned by getLinks have expiry_status reflecting real-time evaluation_
    - _Preservation: Response structure, cache headers, auth behavior, and search/sort logic remain unchanged_
    - _Requirements: 2.1, 2.2, 2.5, 3.5_

  - [x] 3.3 Integrate read-time evaluation into `api/src/functions/redirect.ts`
    - Import `evaluateExpiryStatus` from `../shared/expiry-utils.js`
    - After fetching `privateAlias` and `globalAlias` from the database, apply `evaluateExpiryStatus` to each before checking `expiry_status === "expired"`:
      ```
      if (privateAlias) privateAlias = evaluateExpiryStatus(privateAlias, now);
      if (globalAlias) globalAlias = evaluateExpiryStatus(globalAlias, now);
      ```
    - The existing `const privateExpired = privateAlias?.expiry_status === "expired"` and `const globalExpired = globalAlias?.expiry_status === "expired"` lines then work correctly against the evaluated status
    - _Bug_Condition: redirect checks stored expiry_status which is stale, treating expired links as active_
    - _Expected_Behavior: redirect evaluates expiry at read time and redirects to expired notice for past-expiry links_
    - _Preservation: Analytics side-effects (click_count, last_accessed_at, heat_score) and inactivity resets continue for non-expired links_
    - _Requirements: 2.3, 2.5, 3.3, 3.4_

  - [x] 3.4 Write unit tests for `evaluateExpiryStatus` and `evaluateExpiryStatusBatch`
    - Add tests in `api/tests/unit/expiry-utils.test.ts` (append to existing file):
      - `evaluateExpiryStatus` with `expires_at` in the past → returns `"expired"`
      - `evaluateExpiryStatus` with `expires_at` within 30 days → returns `"expiring_soon"`
      - `evaluateExpiryStatus` with `expires_at` more than 30 days out → returns `"active"`
      - `evaluateExpiryStatus` with `expiry_policy_type: "never"` → returns unchanged
      - `evaluateExpiryStatus` with `expires_at: null` → returns unchanged
      - `evaluateExpiryStatusBatch` applies evaluation to all records in array
    - _Requirements: 2.1, 2.2, 2.4_

  - [x] 3.5 Verify bug condition exploration test now passes
    - **Property 1: Expected Behavior** - Read-Time Expiry Evaluation Corrects Stale Status
    - **IMPORTANT**: Re-run the SAME test from task 1 - do NOT write a new test
    - The test from task 1 encodes the expected behavior
    - When this test passes, it confirms the expected behavior is satisfied
    - Run bug condition exploration test from step 1
    - **EXPECTED OUTCOME**: Test PASSES (confirms bug is fixed)
    - _Requirements: 2.1, 2.2, 2.3_

  - [x] 3.6 Verify preservation tests still pass
    - **Property 2: Preservation** - Non-Expirable and Future-Expiry Records Unchanged
    - **IMPORTANT**: Re-run the SAME tests from task 2 - do NOT write new tests
    - Run preservation property tests from step 2
    - **EXPECTED OUTCOME**: Tests PASS (confirms no regressions)
    - Confirm all tests still pass after fix (no regressions)

  - [x] 3.7 Write integration tests for getLinks and redirect flows
    - Add integration-style tests in `api/tests/unit/getLinks.test.ts` and `api/tests/unit/redirect.test.ts` (append to existing files):
      - **getLinks integration**: Seed in-memory store with records having stale `expiry_status`, call the handler, verify response contains corrected statuses
      - **getLinks popular integration**: Seed store with mix of expired and active records, call with `scope=popular`, verify expired records have corrected `expiry_status` in response
      - **redirect integration**: Seed store with record that has `expires_at` in the past but `expiry_status: "active"`, call redirect, verify it redirects to expired notice page (`/_/?expired=...`)
      - **redirect analytics preservation**: Seed store with non-expired record, call redirect, verify click_count incremented and last_accessed_at updated
    - _Requirements: 2.1, 2.2, 2.3, 3.4, 3.5_

- [x] 4. Checkpoint - Ensure all tests pass
  - Run full test suite: `cd api && npx vitest run`
  - Ensure all property-based tests pass (bug condition exploration + preservation)
  - Ensure all unit tests pass (evaluateExpiryStatus, evaluateExpiryStatusBatch)
  - Ensure all integration tests pass (getLinks flow, redirect flow)
  - Ensure existing tests have not regressed
  - Ask the user if questions arise
