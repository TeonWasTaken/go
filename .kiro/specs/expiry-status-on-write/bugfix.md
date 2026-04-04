# Bugfix Requirements Document

## Introduction

When creating, updating, or renewing a link with an expiry date, the `expiry_status` field is always set to `"active"` regardless of whether the computed `expires_at` is in the past or within 30 days. This means links that should immediately appear as `"expiring_soon"` or `"expired"` at write time are incorrectly marked `"active"` until the daily `expiryProcessor` timer runs at 2 AM UTC. The root cause is in `computeExpiry` (`api/src/shared/expiry-utils.ts`): its `ExpiryStatus` type only includes `"active" | "no_expiry"`, and the function never compares `expires_at` against `now`. Additionally, `updateLink.ts` and `renewLink.ts` override the returned status with a hardcoded `"active"` fallback. As part of this fix, the "expiring soon" threshold is also being changed from 7 days to 30 days across both `computeExpiry` and `expiryProcessor`.

## Bug Analysis

### Current Behavior (Defect)

1.1 WHEN a link is created or updated with a `custom_expires_at` date that is in the past THEN the system sets `expiry_status` to `"active"` instead of `"expired"`

1.2 WHEN a link is created or updated with a `custom_expires_at` date that is within 30 days from now THEN the system sets `expiry_status` to `"active"` instead of `"expiring_soon"`

1.3 WHEN a link is renewed and the recomputed `expires_at` falls within 30 days from now THEN the system sets `expiry_status` to `"active"` instead of `"expiring_soon"`

1.4 WHEN a link is renewed and the recomputed `expires_at` is in the past THEN the system sets `expiry_status` to `"active"` instead of `"expired"`

1.5 WHEN the `ExpiryStatus` type is used in `expiry-utils.ts` THEN it only allows `"active" | "no_expiry"`, preventing `computeExpiry` from returning `"expiring_soon"` or `"expired"`

1.6 WHEN `updateLink.ts` or `renewLink.ts` consume the result of `computeExpiry` THEN they override `expiry_status` with a hardcoded ternary (`"no_expiry"` or `"active"`), discarding any nuanced status

### Expected Behavior (Correct)

2.1 WHEN a link is created or updated with an `expires_at` date that is in the past THEN the system SHALL set `expiry_status` to `"expired"`

2.2 WHEN a link is created or updated with an `expires_at` date that is within 30 days from now THEN the system SHALL set `expiry_status` to `"expiring_soon"`

2.3 WHEN a link is renewed and the recomputed `expires_at` falls within 30 days from now THEN the system SHALL set `expiry_status` to `"expiring_soon"`

2.4 WHEN a link is renewed and the recomputed `expires_at` is in the past THEN the system SHALL set `expiry_status` to `"expired"`

2.5 WHEN the `ExpiryStatus` type is defined in `expiry-utils.ts` THEN it SHALL include `"active" | "expiring_soon" | "expired" | "no_expiry"` to match the `AliasRecord` model

2.6 WHEN `updateLink.ts` or `renewLink.ts` consume the result of `computeExpiry` THEN they SHALL use the returned `expiry_status` directly without overriding it

### Unchanged Behavior (Regression Prevention)

3.1 WHEN a link is created or updated with `expiry_policy_type` of `"never"` THEN the system SHALL CONTINUE TO set `expiry_status` to `"no_expiry"` and `expires_at` to `null`

3.2 WHEN a link is created or updated with an `expires_at` date more than 30 days in the future THEN the system SHALL CONTINUE TO set `expiry_status` to `"active"`

3.3 WHEN `computeExpiry` is called with `expiry_policy_type` of `"inactivity"` THEN the system SHALL CONTINUE TO compute `expires_at` as 12 months from `now`

3.4 WHEN `computeExpiry` is called with `expiry_policy_type` of `"fixed"` and `duration_months` THEN the system SHALL CONTINUE TO compute `expires_at` as `created_at` plus the specified months

3.5 WHEN `computeExpiry` is called with `expiry_policy_type` of `"fixed"` and `custom_expires_at` THEN the system SHALL CONTINUE TO use the provided custom date as `expires_at`

3.6 WHEN the `expiryProcessor` timer runs THEN the system SHALL CONTINUE TO transition records through the `active → expiring_soon → expired → deleted` state machine, using the updated 30-day threshold for the `expiring_soon` transition
