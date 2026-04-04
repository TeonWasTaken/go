# Expiry Status on Write Bugfix Design

## Overview

The `computeExpiry` function in `api/src/shared/expiry-utils.ts` always returns `"active"` for any non-`"never"` policy because its `ExpiryStatus` type only includes `"active" | "no_expiry"` and it never compares `expires_at` against `now`. Additionally, `updateLink.ts` and `renewLink.ts` override the returned status with a hardcoded ternary (`"no_expiry"` or `"active"`), discarding any nuanced status. This means links that are already expired or expiring soon at write time are incorrectly marked `"active"` until the daily `expiryProcessor` timer corrects them. The fix widens the `ExpiryStatus` type, adds time-comparison logic to `computeExpiry`, removes the hardcoded overrides, updates the `ExpiryComputation` interface to include `expired_at`, and changes the "expiring soon" threshold from 7 days to 30 days in both `computeExpiry` and `expiryProcessor`.

## Glossary

- **Bug_Condition (C)**: The condition that triggers the bug — `computeExpiry` is called with an `expires_at` that is in the past or within 30 days of `now`, yet the returned `expiry_status` is `"active"`
- **Property (P)**: The desired behavior — `computeExpiry` returns `"expired"` when `expires_at < now`, `"expiring_soon"` when `expires_at` is within 30 days of `now`, and `"active"` when `expires_at` is more than 30 days away
- **Preservation**: Existing behaviors that must remain unchanged: `"never"` policy returns `"no_expiry"`, date arithmetic for `expires_at` is unaffected, `createLink.ts` already uses `expiry.expiry_status` directly
- **`computeExpiry`**: The function in `api/src/shared/expiry-utils.ts` that computes `expires_at`, `expiry_status`, `expiry_policy_type`, and `duration_months` from policy parameters
- **`ExpiryStatus`**: The type alias in `expiry-utils.ts` constraining valid status values
- **`ExpiryComputation`**: The return interface of `computeExpiry`
- **`expiryProcessor`**: The timer-triggered Azure Function in `api/src/functions/expiryProcessor.ts` that transitions records through the expiry state machine daily
- **THIRTY_DAYS_MS**: The new constant (replacing `SEVEN_DAYS_MS`) representing 30 days in milliseconds, used as the "expiring soon" threshold

## Bug Details

### Bug Condition

The bug manifests when `computeExpiry` is called with any non-`"never"` policy and the computed `expires_at` is either in the past or within 30 days of `now`. The function always returns `expiry_status: "active"` because (1) the `ExpiryStatus` type only allows `"active" | "no_expiry"`, (2) no comparison between `expires_at` and `now` is performed, and (3) `updateLink.ts` and `renewLink.ts` further override the status with `expiry.expiry_status === "no_expiry" ? "no_expiry" : "active"`.

**Formal Specification:**
```
FUNCTION isBugCondition(input)
  INPUT: input of type ComputeExpiryParams
  OUTPUT: boolean

  policyType := input.expiry_policy_type ?? "fixed"
  IF policyType == "never" THEN RETURN false

  expires_at := computeExpiresAtDate(input)
  now := input.now ?? currentTime()

  RETURN expires_at <= now                          // expired
         OR (expires_at - now) <= 30 days           // expiring soon
END FUNCTION
```

### Examples

- **Expired at write time**: `computeExpiry({ expiry_policy_type: "fixed", custom_expires_at: "2024-01-01T00:00:00Z", now: new Date("2024-06-15") })` returns `expiry_status: "active"` instead of `"expired"`
- **Expiring soon at write time**: `computeExpiry({ expiry_policy_type: "fixed", custom_expires_at: "2024-07-01T00:00:00Z", now: new Date("2024-06-15") })` returns `expiry_status: "active"` instead of `"expiring_soon"` (16 days away, within 30-day threshold)
- **Renewal produces wrong status**: Renewing a link whose recomputed `expires_at` is 10 days away still writes `expiry_status: "active"` because `renewLink.ts` overrides with the hardcoded ternary
- **Update produces wrong status**: Updating a link's policy to a `custom_expires_at` in the past still writes `expiry_status: "active"` because `updateLink.ts` overrides with the hardcoded ternary

## Expected Behavior

### Preservation Requirements

**Unchanged Behaviors:**
- `computeExpiry` with `expiry_policy_type: "never"` returns `expires_at: null`, `expiry_status: "no_expiry"`, `duration_months: null`
- `computeExpiry` with `expiry_policy_type: "fixed"` and `duration_months` computes `expires_at` as `created_at + duration_months`
- `computeExpiry` with `expiry_policy_type: "fixed"` and `custom_expires_at` uses the provided date as `expires_at`
- `computeExpiry` with `expiry_policy_type: "inactivity"` computes `expires_at` as `now + 12 months`
- Default (no policy) behaves as `"fixed"` with `duration_months: 12`
- `createLink.ts` already uses `expiry.expiry_status` directly (no override) — this must remain unchanged
- The `expiryProcessor` state machine (`active → expiring_soon → expired → deleted`) continues to function, using the updated 30-day threshold

**Scope:**
All inputs where `expiry_policy_type` is `"never"`, or where `expires_at` is more than 30 days in the future, should be completely unaffected by this fix. The date arithmetic for computing `expires_at` itself is not changing.

## Hypothesized Root Cause

Based on the bug description and code analysis, the root causes are:

1. **Narrow `ExpiryStatus` type**: `ExpiryStatus` in `expiry-utils.ts` is defined as `"active" | "no_expiry"`, which prevents `computeExpiry` from returning `"expiring_soon"` or `"expired"` at the type level

2. **Missing time comparison in `computeExpiry`**: The function computes `expires_at` but never compares it against `now` to determine whether the link is already expired or expiring soon — it unconditionally returns `"active"` for all non-`"never"` policies

3. **Hardcoded status overrides in `updateLink.ts` and `renewLink.ts`**: Both files contain `record.expiry_status = expiry.expiry_status === "no_expiry" ? "no_expiry" : "active"`, which discards any nuanced status that `computeExpiry` might return

4. **Missing `expired_at` in `ExpiryComputation`**: The return interface does not include `expired_at`, so even if `computeExpiry` detected an expired state, it couldn't communicate the timestamp

5. **Stale 7-day threshold in `expiryProcessor`**: The `SEVEN_DAYS_MS` constant uses a 7-day window for "expiring soon", which is inconsistent with the desired 30-day threshold

## Correctness Properties

Property 1: Bug Condition - Expired status at write time

_For any_ input where `expiry_policy_type` is not `"never"` and the computed `expires_at` is in the past relative to `now`, the fixed `computeExpiry` function SHALL return `expiry_status: "expired"` and `expired_at` set to `now.toISOString()`.

**Validates: Requirements 2.1, 2.4**

Property 2: Bug Condition - Expiring soon status at write time

_For any_ input where `expiry_policy_type` is not `"never"` and the computed `expires_at` is in the future but within 30 days of `now`, the fixed `computeExpiry` function SHALL return `expiry_status: "expiring_soon"` and `expired_at` set to `null`.

**Validates: Requirements 2.2, 2.3**

Property 3: Preservation - Active status for far-future expiry

_For any_ input where `expiry_policy_type` is not `"never"` and the computed `expires_at` is more than 30 days in the future relative to `now`, the fixed `computeExpiry` function SHALL return `expiry_status: "active"` and `expired_at` set to `null`, identical to the original function's behavior.

**Validates: Requirements 3.2, 3.3, 3.4, 3.5**

Property 4: Preservation - Never policy unchanged

_For any_ input where `expiry_policy_type` is `"never"`, the fixed `computeExpiry` function SHALL return `expires_at: null`, `expiry_status: "no_expiry"`, `expired_at: null`, and `duration_months: null`, identical to the original function's behavior.

**Validates: Requirements 3.1**

Property 5: Preservation - Callers use computeExpiry status directly

_For any_ call to `updateLink` or `renewLink` that triggers expiry recalculation, the handler SHALL use the `expiry_status` and `expired_at` values returned by `computeExpiry` directly, without overriding them.

**Validates: Requirements 2.6**

## Fix Implementation

### Changes Required

Assuming our root cause analysis is correct:

**File**: `api/src/shared/expiry-utils.ts`

**Changes**:
1. **Widen `ExpiryStatus` type**: Change from `"active" | "no_expiry"` to `"active" | "expiring_soon" | "expired" | "no_expiry"` to match the `AliasRecord` model
2. **Add `expired_at` to `ExpiryComputation`**: Add `expired_at: string | null` field to the return interface
3. **Add 30-day threshold constant**: Add `const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000`
4. **Add status evaluation logic**: After computing `expires_at`, compare it against `now`:
   - If `expires_at <= now` → `expiry_status = "expired"`, `expired_at = now.toISOString()`
   - If `expires_at - now <= THIRTY_DAYS_MS` → `expiry_status = "expiring_soon"`, `expired_at = null`
   - Otherwise → `expiry_status = "active"`, `expired_at = null`

**File**: `api/src/functions/updateLink.ts`

**Changes**:
5. **Remove hardcoded status override**: Replace `record.expiry_status = expiry.expiry_status === "no_expiry" ? "no_expiry" : "active"` with `record.expiry_status = expiry.expiry_status`
6. **Set `expired_at` from computation**: Add `record.expired_at = expiry.expired_at`

**File**: `api/src/functions/renewLink.ts`

**Changes**:
7. **Remove hardcoded status override**: Replace `record.expiry_status = expiry.expiry_status === "no_expiry" ? "no_expiry" : "active"` with `record.expiry_status = expiry.expiry_status`
8. **Set `expired_at` from computation**: Replace `record.expired_at = null` with `record.expired_at = expiry.expired_at`

**File**: `api/src/functions/expiryProcessor.ts`

**Changes**:
9. **Rename and update threshold constant**: Rename `SEVEN_DAYS_MS` to `THIRTY_DAYS_MS` and change value from `7 * 24 * 60 * 60 * 1000` to `30 * 24 * 60 * 60 * 1000`
10. **Update threshold reference**: Update the comparison `expiresAtMs - nowMs <= SEVEN_DAYS_MS` to use `THIRTY_DAYS_MS`

## Testing Strategy

### Validation Approach

The testing strategy follows a two-phase approach: first, surface counterexamples that demonstrate the bug on unfixed code, then verify the fix works correctly and preserves existing behavior.

### Exploratory Bug Condition Checking

**Goal**: Surface counterexamples that demonstrate the bug BEFORE implementing the fix. Confirm or refute the root cause analysis. If we refute, we will need to re-hypothesize.

**Test Plan**: Write tests that call `computeExpiry` with `expires_at` values in the past and within 30 days of `now`, and assert the returned `expiry_status`. Run these tests on the UNFIXED code to observe failures.

**Test Cases**:
1. **Expired custom date**: Call `computeExpiry` with `custom_expires_at` in the past — expect `"expired"` but get `"active"` (will fail on unfixed code)
2. **Expiring soon custom date**: Call `computeExpiry` with `custom_expires_at` 15 days from now — expect `"expiring_soon"` but get `"active"` (will fail on unfixed code)
3. **Expired via duration**: Call `computeExpiry` with `created_at` far in the past and `duration_months: 1` so `expires_at` is in the past — expect `"expired"` but get `"active"` (will fail on unfixed code)
4. **Expiring soon via duration**: Call `computeExpiry` with parameters producing `expires_at` 20 days from now — expect `"expiring_soon"` but get `"active"` (will fail on unfixed code)

**Expected Counterexamples**:
- `computeExpiry` returns `expiry_status: "active"` for all non-`"never"` inputs regardless of `expires_at` relative to `now`
- Root cause confirmed: no time comparison exists in the function, and `ExpiryStatus` type prevents returning `"expiring_soon"` or `"expired"`

### Fix Checking

**Goal**: Verify that for all inputs where the bug condition holds, the fixed function produces the expected behavior.

**Pseudocode:**
```
FOR ALL input WHERE isBugCondition(input) DO
  result := computeExpiry_fixed(input)
  IF result.expires_at <= now THEN
    ASSERT result.expiry_status == "expired"
    ASSERT result.expired_at == now.toISOString()
  ELSE IF (result.expires_at - now) <= 30 days THEN
    ASSERT result.expiry_status == "expiring_soon"
    ASSERT result.expired_at == null
  END IF
END FOR
```

### Preservation Checking

**Goal**: Verify that for all inputs where the bug condition does NOT hold, the fixed function produces the same result as the original function.

**Pseudocode:**
```
FOR ALL input WHERE NOT isBugCondition(input) DO
  ASSERT computeExpiry_original(input).expires_at == computeExpiry_fixed(input).expires_at
  ASSERT computeExpiry_original(input).expiry_status == computeExpiry_fixed(input).expiry_status
  ASSERT computeExpiry_original(input).expiry_policy_type == computeExpiry_fixed(input).expiry_policy_type
  ASSERT computeExpiry_original(input).duration_months == computeExpiry_fixed(input).duration_months
END FOR
```

**Testing Approach**: Property-based testing is recommended for preservation checking because:
- It generates many random policy configurations and dates automatically
- It catches edge cases around the 30-day boundary that manual tests might miss
- It provides strong guarantees that `"never"` policy and far-future `"active"` behavior are unchanged

**Test Plan**: Observe behavior on UNFIXED code first for `"never"` policy and far-future dates, then write property-based tests capturing that behavior.

**Test Cases**:
1. **Never policy preservation**: Verify `"never"` policy continues to return `expires_at: null`, `expiry_status: "no_expiry"` across many random `now` values
2. **Active status preservation**: Verify that when `expires_at` is more than 30 days in the future, `expiry_status` remains `"active"` across many random configurations
3. **Date arithmetic preservation**: Verify `expires_at` computation (created_at + duration_months, custom date passthrough, inactivity = now + 12 months) is unchanged
4. **ExpiryProcessor threshold consistency**: Verify the processor's 30-day threshold matches `computeExpiry`'s 30-day threshold

### Unit Tests

- Test `computeExpiry` returns `"expired"` with `expired_at` for past `expires_at`
- Test `computeExpiry` returns `"expiring_soon"` with `expired_at: null` for `expires_at` within 30 days
- Test `computeExpiry` returns `"active"` with `expired_at: null` for `expires_at` more than 30 days away
- Test `computeExpiry` returns `"no_expiry"` with `expired_at: null` for `"never"` policy
- Test boundary: `expires_at` exactly 30 days from `now` (should be `"expiring_soon"`)
- Test boundary: `expires_at` exactly equal to `now` (should be `"expired"`)
- Test `updateLink` and `renewLink` use `expiry_status` from `computeExpiry` without override
- Test `expiryProcessor` uses 30-day threshold for `expiring_soon` transition

### Property-Based Tests

- Generate random `now` and `custom_expires_at` in the past → assert `expiry_status == "expired"` and `expired_at == now.toISOString()`
- Generate random `now` and `custom_expires_at` within 30 days → assert `expiry_status == "expiring_soon"` and `expired_at == null`
- Generate random `now` and `custom_expires_at` more than 30 days away → assert `expiry_status == "active"` and `expired_at == null`
- Generate random `now` with `"never"` policy → assert unchanged behavior (`expires_at: null`, `expiry_status: "no_expiry"`)
- Generate random policy configurations and verify `expires_at` date arithmetic is unchanged from original

### Integration Tests

- Test full create-link flow with a past `custom_expires_at` and verify the persisted record has `expiry_status: "expired"`
- Test full update-link flow changing policy to a near-future date and verify `expiry_status: "expiring_soon"`
- Test full renew-link flow where recomputed `expires_at` is within 30 days and verify `expiry_status: "expiring_soon"`
- Test that `expiryProcessor` and `computeExpiry` agree on the 30-day boundary for `expiring_soon`
