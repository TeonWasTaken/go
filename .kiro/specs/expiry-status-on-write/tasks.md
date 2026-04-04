# Implementation Plan

- [x] 1. Write bug condition exploration test
  - **Property 1: Bug Condition** - Expiry Status Incorrect at Write Time
  - **CRITICAL**: This test MUST FAIL on unfixed code - failure confirms the bug exists
  - **DO NOT attempt to fix the test or the code when it fails**
  - **NOTE**: This test encodes the expected behavior - it will validate the fix when it passes after implementation
  - **GOAL**: Surface counterexamples that demonstrate `computeExpiry` always returns `"active"` regardless of `expires_at` relative to `now`
  - **Scoped PBT Approach**: Scope the property to concrete failing cases:
    - Expired: `computeExpiry({ expiry_policy_type: "fixed", custom_expires_at: "2024-01-01T00:00:00.000Z", now: new Date("2024-06-15T12:00:00.000Z") })` — expect `expiry_status: "expired"` but will get `"active"`
    - Expiring soon: `computeExpiry({ expiry_policy_type: "fixed", custom_expires_at: "2024-07-01T00:00:00.000Z", now: new Date("2024-06-15T12:00:00.000Z") })` — expect `expiry_status: "expiring_soon"` but will get `"active"` (16 days away, within 30-day threshold)
    - Expired via duration: `computeExpiry({ expiry_policy_type: "fixed", duration_months: 1, created_at: "2023-01-01T00:00:00.000Z", now: new Date("2024-06-15T12:00:00.000Z") })` — expect `"expired"` but will get `"active"`
    - Expiring soon via duration: call with params producing `expires_at` ~20 days from `now` — expect `"expiring_soon"` but will get `"active"`
  - Write property-based test in `api/tests/property/expiry-status-on-write.property.ts` using fast-check
  - Generate random `now` and `custom_expires_at` in the past → assert `expiry_status == "expired"`
  - Generate random `now` and `custom_expires_at` within 30 days of `now` → assert `expiry_status == "expiring_soon"`
  - Run test on UNFIXED code
  - **EXPECTED OUTCOME**: Test FAILS (this is correct - it proves the bug exists because `computeExpiry` always returns `"active"`)
  - Document counterexamples found to confirm root cause: `ExpiryStatus` type only allows `"active" | "no_expiry"` and no time comparison exists
  - Mark task complete when test is written, run, and failure is documented
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5_

- [x] 2. Write preservation property tests (BEFORE implementing fix)
  - **Property 2: Preservation** - Unchanged Behavior for Never Policy and Far-Future Expiry
  - **IMPORTANT**: Follow observation-first methodology
  - Observe on UNFIXED code:
    - `computeExpiry({ expiry_policy_type: "never", now })` returns `{ expires_at: null, expiry_status: "no_expiry", duration_months: null }`
    - `computeExpiry({ expiry_policy_type: "fixed", duration_months: 12, created_at: now.toISOString(), now })` returns `expiry_status: "active"` with `expires_at` = created_at + 12 months (more than 30 days away)
    - `computeExpiry({ expiry_policy_type: "inactivity", now })` returns `expiry_status: "active"` with `expires_at` = now + 12 months
    - `computeExpiry({ expiry_policy_type: "fixed", custom_expires_at: farFutureDate, now })` returns `expiry_status: "active"` with `expires_at` = custom date
  - Write property-based tests in `api/tests/property/expiry-status-on-write.property.ts` using fast-check:
    - For all random `now` values: `"never"` policy returns `expires_at: null`, `expiry_status: "no_expiry"`, `duration_months: null`
    - For all random configs where computed `expires_at` is more than 30 days from `now`: `expiry_status` is `"active"`
    - For all random `duration_months` and `created_at`: `expires_at` date arithmetic (created_at + months) is unchanged
    - For all random `custom_expires_at` more than 30 days away: `expires_at` equals the custom date directly
    - For all random `now` with `"inactivity"` policy: `expires_at` equals `now + 12 months`
  - Verify tests PASS on UNFIXED code
  - **EXPECTED OUTCOME**: Tests PASS (this confirms baseline behavior to preserve)
  - Mark task complete when tests are written, run, and passing on unfixed code
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_

- [x] 3. Implement the expiry-status-on-write fix

  - [x] 3.1 Widen `ExpiryStatus` type and update `ExpiryComputation` interface
    - In `api/src/shared/expiry-utils.ts`, change `ExpiryStatus` from `"active" | "no_expiry"` to `"active" | "expiring_soon" | "expired" | "no_expiry"`
    - Add `expired_at: string | null` field to the `ExpiryComputation` interface
    - _Bug_Condition: isBugCondition(input) where expiry_policy_type != "never" AND (expires_at <= now OR expires_at - now <= 30 days)_
    - _Expected_Behavior: ExpiryStatus type allows returning "expiring_soon" and "expired"; ExpiryComputation includes expired_at_
    - _Requirements: 2.5_

  - [x] 3.2 Add status evaluation logic to `computeExpiry`
    - Add `const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000` constant
    - After computing `expires_at`, compare against `now`:
      - If `expiresAtMs <= nowMs` → return `expiry_status: "expired"`, `expired_at: now.toISOString()`
      - If `expiresAtMs - nowMs <= THIRTY_DAYS_MS` → return `expiry_status: "expiring_soon"`, `expired_at: null`
      - Otherwise → return `expiry_status: "active"`, `expired_at: null`
    - Ensure `"never"` policy path also returns `expired_at: null`
    - _Bug_Condition: computeExpiry never compares expires_at against now_
    - _Expected_Behavior: computeExpiry returns "expired" when expires_at < now, "expiring_soon" when within 30 days, "active" otherwise_
    - _Preservation: "never" policy unchanged, date arithmetic unchanged_
    - _Requirements: 2.1, 2.2, 2.3, 2.4_

  - [x] 3.3 Remove hardcoded status override in `updateLink.ts`
    - Replace `record.expiry_status = expiry.expiry_status === "no_expiry" ? "no_expiry" : "active"` with `record.expiry_status = expiry.expiry_status`
    - Add `record.expired_at = expiry.expired_at` after the expiry_status assignment
    - _Bug_Condition: updateLink overrides expiry_status with hardcoded ternary_
    - _Expected_Behavior: updateLink uses expiry_status and expired_at from computeExpiry directly_
    - _Requirements: 2.6_

  - [x] 3.4 Remove hardcoded status override in `renewLink.ts`
    - Replace `record.expiry_status = expiry.expiry_status === "no_expiry" ? "no_expiry" : "active"` with `record.expiry_status = expiry.expiry_status`
    - Replace `record.expired_at = null` with `record.expired_at = expiry.expired_at`
    - _Bug_Condition: renewLink overrides expiry_status with hardcoded ternary and always sets expired_at to null_
    - _Expected_Behavior: renewLink uses expiry_status and expired_at from computeExpiry directly_
    - _Requirements: 2.6_

  - [x] 3.5 Update `expiryProcessor.ts` threshold from 7 days to 30 days
    - Rename `SEVEN_DAYS_MS` to `THIRTY_DAYS_MS` and change value from `7 * 24 * 60 * 60 * 1000` to `30 * 24 * 60 * 60 * 1000`
    - Update the comparison `expiresAtMs - nowMs <= SEVEN_DAYS_MS` to use `THIRTY_DAYS_MS`
    - _Preservation: expiryProcessor state machine (active → expiring_soon → expired → deleted) continues to function with updated threshold_
    - _Requirements: 3.6_

  - [x] 3.6 Update existing unit tests for 30-day threshold
    - Update `api/tests/unit/expiry-utils.test.ts` to assert `"expiring_soon"` and `"expired"` statuses where applicable
    - Update any existing `expiryProcessor` tests that reference the 7-day threshold to use 30 days
    - Add unit tests for boundary cases: `expires_at` exactly 30 days from `now` (expect `"expiring_soon"`), `expires_at` exactly equal to `now` (expect `"expired"`)
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 3.6_

  - [x] 3.7 Verify bug condition exploration test now passes
    - **Property 1: Expected Behavior** - Expiry Status Correct at Write Time
    - **IMPORTANT**: Re-run the SAME test from task 1 - do NOT write a new test
    - The test from task 1 encodes the expected behavior (expired/expiring_soon statuses)
    - When this test passes, it confirms the expected behavior is satisfied
    - Run bug condition exploration test from step 1
    - **EXPECTED OUTCOME**: Test PASSES (confirms bug is fixed)
    - _Requirements: 2.1, 2.2, 2.3, 2.4_

  - [x] 3.8 Verify preservation tests still pass
    - **Property 2: Preservation** - Unchanged Behavior for Never Policy and Far-Future Expiry
    - **IMPORTANT**: Re-run the SAME tests from task 2 - do NOT write new tests
    - Run preservation property tests from step 2
    - **EXPECTED OUTCOME**: Tests PASS (confirms no regressions)
    - Confirm all preservation tests still pass after fix (no regressions)

- [x] 4. Checkpoint - Ensure all tests pass
  - Run full test suite: `cd api && npx vitest --run`
  - Ensure all unit tests, property tests, and existing tests pass
  - Ensure no regressions in `expiry-utils`, `expiryProcessor`, `updateLink`, `renewLink`, or `createLink` tests
  - Ask the user if questions arise
