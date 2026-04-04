/**
 * Expiry computation utility.
 *
 * Computes `expires_at` and `expiry_status` from an expiry policy
 * configuration. Used during alias creation, update, and renewal.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ExpiryPolicyType = "never" | "fixed" | "inactivity";
export type DurationMonths = 1 | 3 | 12;
export type ExpiryStatus = "active" | "expiring_soon" | "expired" | "no_expiry";

export interface ExpiryComputation {
  expires_at: string | null;
  expiry_status: ExpiryStatus;
  expired_at: string | null;
  expiry_policy_type: ExpiryPolicyType;
  duration_months: DurationMonths | null;
}

export interface ComputeExpiryParams {
  expiry_policy_type?: ExpiryPolicyType;
  duration_months?: DurationMonths;
  custom_expires_at?: string;
  created_at?: string;
  now?: Date;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function evaluateStatus(
  expiresAtMs: number,
  now: Date,
): { expiry_status: ExpiryStatus; expired_at: string | null } {
  const nowMs = now.getTime();
  if (expiresAtMs <= nowMs) {
    return { expiry_status: "expired", expired_at: now.toISOString() };
  }
  if (expiresAtMs - nowMs <= THIRTY_DAYS_MS) {
    return { expiry_status: "expiring_soon", expired_at: null };
  }
  return { expiry_status: "active", expired_at: null };
}

function addMonths(date: Date, months: number): Date {
  const result = new Date(date.getTime());
  result.setUTCMonth(result.getUTCMonth() + months);
  return result;
}

// ---------------------------------------------------------------------------
// Main function
// ---------------------------------------------------------------------------

export function computeExpiry(params: ComputeExpiryParams): ExpiryComputation {
  const now = params.now ?? new Date();
  const policyType = params.expiry_policy_type ?? "fixed";

  if (policyType === "never") {
    return {
      expires_at: null,
      expiry_status: "no_expiry",
      expired_at: null,
      expiry_policy_type: "never",
      duration_months: null,
    };
  }

  if (policyType === "inactivity") {
    const expiresAt = addMonths(now, 12);
    const status = evaluateStatus(expiresAt.getTime(), now);
    return {
      expires_at: expiresAt.toISOString(),
      ...status,
      expiry_policy_type: "inactivity",
      duration_months: null,
    };
  }

  // policyType === "fixed"
  if (params.custom_expires_at) {
    const expiresAtMs = new Date(params.custom_expires_at).getTime();
    const status = evaluateStatus(expiresAtMs, now);
    return {
      expires_at: params.custom_expires_at,
      ...status,
      expiry_policy_type: "fixed",
      duration_months: null,
    };
  }

  const durationMonths: DurationMonths = params.duration_months ?? 12;
  const baseDate = params.created_at ? new Date(params.created_at) : now;
  const expiresAt = addMonths(baseDate, durationMonths);
  const status = evaluateStatus(expiresAt.getTime(), now);

  return {
    expires_at: expiresAt.toISOString(),
    ...status,
    expiry_policy_type: "fixed",
    duration_months: durationMonths,
  };
}
