/**
 * Alias record interfaces and validation functions.
 *
 * Provides TypeScript types for alias records and request payloads,
 * plus validation helpers that return structured results for clear
 * error reporting.
 */

// ---------------------------------------------------------------------------
// Interfaces
// ---------------------------------------------------------------------------

export interface AliasRecord {
  id: string;
  alias: string;
  destination_url: string;
  created_by: string;
  title: string;
  click_count: number;
  heat_score: number;
  heat_updated_at: string | null;
  is_private: boolean;
  created_at: string;
  last_accessed_at: string | null;
  expiry_policy_type: "never" | "fixed" | "inactivity";
  duration_months: 1 | 3 | 12 | null;
  custom_expires_at: string | null;
  expires_at: string | null;
  expiry_status: "active" | "expiring_soon" | "expired" | "no_expiry";
  expired_at: string | null;
  icon_url: string | null;
}

export interface CreateAliasRequest {
  alias: string;
  destination_url: string;
  title: string;
  is_private?: boolean;
  expiry_policy_type?: "never" | "fixed" | "inactivity";
  duration_months?: 1 | 3 | 12;
  custom_expires_at?: string;
  icon_url?: string;
}

export interface UpdateAliasRequest {
  destination_url?: string;
  title?: string;
  is_private?: boolean;
  expiry_policy_type?: "never" | "fixed" | "inactivity";
  duration_months?: 1 | 3 | 12;
  custom_expires_at?: string;
  icon_url?: string;
}

// ---------------------------------------------------------------------------
// Validation result type
// ---------------------------------------------------------------------------

export type ValidationResult =
  | { valid: true }
  | { valid: false; error: string };

// ---------------------------------------------------------------------------
// Alias format validation
// ---------------------------------------------------------------------------

const ALIAS_PATTERN = /^[a-z0-9-]+$/;

export function validateAlias(alias: string): ValidationResult {
  if (!alias) {
    return { valid: false, error: "Alias is required" };
  }
  if (!ALIAS_PATTERN.test(alias)) {
    return {
      valid: false,
      error:
        "Alias must contain only lowercase alphanumeric characters and hyphens",
    };
  }
  return { valid: true };
}

// ---------------------------------------------------------------------------
// Destination URL validation
// ---------------------------------------------------------------------------

export function validateDestinationUrl(url: string): ValidationResult {
  if (!url) {
    return { valid: false, error: "Destination URL is required" };
  }
  try {
    new URL(url);
    return { valid: true };
  } catch {
    return { valid: false, error: "Destination URL is not a valid URL format" };
  }
}

// ---------------------------------------------------------------------------
// Expiry policy validation
// ---------------------------------------------------------------------------

const VALID_EXPIRY_TYPES = new Set(["never", "fixed", "inactivity"]);
const VALID_DURATION_MONTHS = new Set([1, 3, 12]);

export function validateExpiryPolicy(
  policyType: string | undefined,
  durationMonths: number | undefined,
  customExpiresAt: string | undefined,
): ValidationResult {
  // If no policy type provided, it will default elsewhere — nothing to validate
  if (policyType === undefined) {
    return { valid: true };
  }

  if (!VALID_EXPIRY_TYPES.has(policyType)) {
    return {
      valid: false,
      error: "Expiry policy type must be one of: never, fixed, inactivity",
    };
  }

  if (policyType === "fixed") {
    return validateFixedPolicyConfig(durationMonths, customExpiresAt);
  }

  // For 'inactivity', no configurable duration is accepted
  if (policyType === "inactivity") {
    if (durationMonths !== undefined || customExpiresAt !== undefined) {
      return {
        valid: false,
        error:
          "Inactivity policy does not accept duration_months or custom_expires_at",
      };
    }
  }

  // For 'never', no duration fields should be set
  if (policyType === "never") {
    if (durationMonths !== undefined || customExpiresAt !== undefined) {
      return {
        valid: false,
        error:
          "Never policy does not accept duration_months or custom_expires_at",
      };
    }
  }

  return { valid: true };
}

// ---------------------------------------------------------------------------
// Fixed policy config validation
// ---------------------------------------------------------------------------

export function validateFixedPolicyConfig(
  durationMonths: number | undefined,
  customExpiresAt: string | undefined,
): ValidationResult {
  const hasDuration = durationMonths !== undefined;
  const hasCustomDate = customExpiresAt !== undefined;

  if (hasDuration && hasCustomDate) {
    return {
      valid: false,
      error:
        "Fixed policy requires either duration_months or custom_expires_at, not both",
    };
  }

  if (!hasDuration && !hasCustomDate) {
    return {
      valid: false,
      error:
        "Fixed policy requires either duration_months or custom_expires_at",
    };
  }

  if (hasDuration && !VALID_DURATION_MONTHS.has(durationMonths)) {
    return {
      valid: false,
      error: "duration_months must be 1, 3, or 12",
    };
  }

  if (hasCustomDate) {
    const date = new Date(customExpiresAt);
    if (isNaN(date.getTime())) {
      return {
        valid: false,
        error: "custom_expires_at must be a valid ISO 8601 date",
      };
    }
    if (date.getTime() <= Date.now()) {
      return {
        valid: false,
        error: "custom_expires_at must be a future date",
      };
    }
  }

  return { valid: true };
}

// ---------------------------------------------------------------------------
// ID generation
// ---------------------------------------------------------------------------

export function generateAliasId(
  alias: string,
  isPrivate: boolean,
  createdBy: string,
): string {
  return isPrivate ? `${alias}:${createdBy}` : alias;
}

// ---------------------------------------------------------------------------
// Convenience: validate a full CreateAliasRequest
// ---------------------------------------------------------------------------

export function validateCreateAliasRequest(
  req: CreateAliasRequest,
): ValidationResult {
  const aliasResult = validateAlias(req.alias);
  if (!aliasResult.valid) return aliasResult;

  const urlResult = validateDestinationUrl(req.destination_url);
  if (!urlResult.valid) return urlResult;

  if (!req.title) {
    return { valid: false, error: "Title is required" };
  }

  return validateExpiryPolicy(
    req.expiry_policy_type,
    req.duration_months,
    req.custom_expires_at,
  );
}

// ---------------------------------------------------------------------------
// Convenience: validate a full UpdateAliasRequest
// ---------------------------------------------------------------------------

export function validateUpdateAliasRequest(
  req: UpdateAliasRequest,
): ValidationResult {
  if (req.destination_url !== undefined) {
    const urlResult = validateDestinationUrl(req.destination_url);
    if (!urlResult.valid) return urlResult;
  }

  return validateExpiryPolicy(
    req.expiry_policy_type,
    req.duration_months,
    req.custom_expires_at,
  );
}
