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
export type ExpiryStatus = "active" | "no_expiry";

export interface ExpiryComputation {
  expires_at: string | null;
  expiry_status: ExpiryStatus;
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
// Helpers
// ---------------------------------------------------------------------------

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
      expiry_policy_type: "never",
      duration_months: null,
    };
  }

  if (policyType === "inactivity") {
    const expiresAt = addMonths(now, 12);
    return {
      expires_at: expiresAt.toISOString(),
      expiry_status: "active",
      expiry_policy_type: "inactivity",
      duration_months: null,
    };
  }

  // policyType === "fixed"
  if (params.custom_expires_at) {
    return {
      expires_at: params.custom_expires_at,
      expiry_status: "active",
      expiry_policy_type: "fixed",
      duration_months: null,
    };
  }

  const durationMonths: DurationMonths = params.duration_months ?? 12;
  const baseDate = params.created_at ? new Date(params.created_at) : now;
  const expiresAt = addMonths(baseDate, durationMonths);

  return {
    expires_at: expiresAt.toISOString(),
    expiry_status: "active",
    expiry_policy_type: "fixed",
    duration_months: durationMonths,
  };
}
