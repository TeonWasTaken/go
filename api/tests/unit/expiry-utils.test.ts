import { describe, expect, it } from "vitest";
import { computeExpiry } from "../../src/shared/expiry-utils.js";

describe("computeExpiry", () => {
  const now = new Date("2024-06-15T12:00:00.000Z");

  describe("default behavior (no policy provided)", () => {
    it("defaults to fixed with duration_months 12", () => {
      const result = computeExpiry({ now });
      expect(result.expiry_policy_type).toBe("fixed");
      expect(result.duration_months).toBe(12);
      expect(result.expiry_status).toBe("active");
      expect(result.expires_at).toBe("2025-06-15T12:00:00.000Z");
      expect(result.expired_at).toBeNull();
    });
  });

  describe("never policy", () => {
    it("returns null expires_at and no_expiry status", () => {
      const result = computeExpiry({ expiry_policy_type: "never", now });
      expect(result.expires_at).toBeNull();
      expect(result.expiry_status).toBe("no_expiry");
      expect(result.expiry_policy_type).toBe("never");
      expect(result.duration_months).toBeNull();
      expect(result.expired_at).toBeNull();
    });
  });

  describe("fixed policy with duration_months", () => {
    it("adds 1 month to created_at", () => {
      const result = computeExpiry({
        expiry_policy_type: "fixed",
        duration_months: 1,
        created_at: "2024-06-15T12:00:00.000Z",
        now,
      });
      expect(result.expires_at).toBe("2024-07-15T12:00:00.000Z");
      // 1 month from now is exactly 30 days — within the 30-day threshold
      expect(result.expiry_status).toBe("expiring_soon");
      expect(result.duration_months).toBe(1);
      expect(result.expired_at).toBeNull();
    });

    it("adds 3 months to created_at", () => {
      const result = computeExpiry({
        expiry_policy_type: "fixed",
        duration_months: 3,
        created_at: "2024-06-15T12:00:00.000Z",
        now,
      });
      expect(result.expires_at).toBe("2024-09-15T12:00:00.000Z");
      expect(result.expiry_status).toBe("active");
      expect(result.duration_months).toBe(3);
      expect(result.expired_at).toBeNull();
    });

    it("adds 12 months to created_at", () => {
      const result = computeExpiry({
        expiry_policy_type: "fixed",
        duration_months: 12,
        created_at: "2024-06-15T12:00:00.000Z",
        now,
      });
      expect(result.expires_at).toBe("2025-06-15T12:00:00.000Z");
      expect(result.expiry_status).toBe("active");
      expect(result.duration_months).toBe(12);
      expect(result.expired_at).toBeNull();
    });

    it("uses now when no created_at is provided", () => {
      const result = computeExpiry({
        expiry_policy_type: "fixed",
        duration_months: 3,
        now,
      });
      expect(result.expires_at).toBe("2024-09-15T12:00:00.000Z");
    });
  });

  describe("fixed policy with custom_expires_at", () => {
    it("uses the provided custom date directly", () => {
      const customDate = "2025-12-31T23:59:59.000Z";
      const result = computeExpiry({
        expiry_policy_type: "fixed",
        custom_expires_at: customDate,
        now,
      });
      expect(result.expires_at).toBe(customDate);
      expect(result.expiry_status).toBe("active");
      expect(result.expiry_policy_type).toBe("fixed");
      expect(result.duration_months).toBeNull();
      expect(result.expired_at).toBeNull();
    });

    it("returns expired when custom_expires_at is in the past", () => {
      const pastDate = "2024-01-01T00:00:00.000Z";
      const result = computeExpiry({
        expiry_policy_type: "fixed",
        custom_expires_at: pastDate,
        now,
      });
      expect(result.expires_at).toBe(pastDate);
      expect(result.expiry_status).toBe("expired");
      expect(result.expired_at).toBe(now.toISOString());
    });

    it("returns expiring_soon when custom_expires_at is within 30 days", () => {
      // 15 days from now
      const soonDate = "2024-06-30T12:00:00.000Z";
      const result = computeExpiry({
        expiry_policy_type: "fixed",
        custom_expires_at: soonDate,
        now,
      });
      expect(result.expires_at).toBe(soonDate);
      expect(result.expiry_status).toBe("expiring_soon");
      expect(result.expired_at).toBeNull();
    });
  });

  describe("inactivity policy", () => {
    it("sets expires_at to 12 months from now", () => {
      const result = computeExpiry({
        expiry_policy_type: "inactivity",
        now,
      });
      expect(result.expires_at).toBe("2025-06-15T12:00:00.000Z");
      expect(result.expiry_status).toBe("active");
      expect(result.expiry_policy_type).toBe("inactivity");
      expect(result.duration_months).toBeNull();
      expect(result.expired_at).toBeNull();
    });
  });

  describe("boundary cases", () => {
    it("returns expiring_soon when expires_at is exactly 30 days from now", () => {
      // Exactly 30 days from now
      const exactly30Days = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString();
      const result = computeExpiry({
        expiry_policy_type: "fixed",
        custom_expires_at: exactly30Days,
        now,
      });
      expect(result.expires_at).toBe(exactly30Days);
      expect(result.expiry_status).toBe("expiring_soon");
      expect(result.expired_at).toBeNull();
    });

    it("returns expired when expires_at is exactly equal to now", () => {
      const result = computeExpiry({
        expiry_policy_type: "fixed",
        custom_expires_at: now.toISOString(),
        now,
      });
      expect(result.expires_at).toBe(now.toISOString());
      expect(result.expiry_status).toBe("expired");
      expect(result.expired_at).toBe(now.toISOString());
    });
  });
});

import {
    evaluateExpiryStatus,
    evaluateExpiryStatusBatch,
} from "../../src/shared/expiry-utils.js";
import type { AliasRecord } from "../../src/shared/models.js";

// ---------------------------------------------------------------------------
// Helper: build a minimal AliasRecord for testing
// ---------------------------------------------------------------------------

function buildRecord(overrides: Partial<AliasRecord> = {}): AliasRecord {
  return {
    id: "test-id",
    alias: "test",
    destination_url: "https://example.com",
    created_by: "user@test.com",
    title: "Test Link",
    click_count: 0,
    heat_score: 0,
    heat_updated_at: null,
    is_private: false,
    created_at: "2024-01-01T00:00:00.000Z",
    last_accessed_at: null,
    expiry_policy_type: "fixed",
    duration_months: 12,
    custom_expires_at: null,
    expires_at: "2025-01-01T00:00:00.000Z",
    expiry_status: "active",
    expired_at: null,
    icon_url: null,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// evaluateExpiryStatus
// ---------------------------------------------------------------------------

describe("evaluateExpiryStatus", () => {
  const now = new Date("2025-07-01T12:00:00.000Z");

  it('returns "expired" when expires_at is in the past', () => {
    const record = buildRecord({
      expires_at: "2025-01-15T00:00:00.000Z",
      expiry_status: "active",
    });

    const result = evaluateExpiryStatus(record, now);

    expect(result.expiry_status).toBe("expired");
    expect(result.expired_at).toBe(now.toISOString());
  });

  it('returns "expiring_soon" when expires_at is within 30 days', () => {
    // 15 days from now
    const record = buildRecord({
      expires_at: "2025-07-16T12:00:00.000Z",
      expiry_status: "active",
    });

    const result = evaluateExpiryStatus(record, now);

    expect(result.expiry_status).toBe("expiring_soon");
    expect(result.expired_at).toBeNull();
  });

  it('returns "active" when expires_at is more than 30 days out', () => {
    const record = buildRecord({
      expires_at: "2026-06-01T00:00:00.000Z",
      expiry_status: "active",
    });

    const result = evaluateExpiryStatus(record, now);

    expect(result.expiry_status).toBe("active");
    expect(result.expired_at).toBeNull();
  });

  it("returns record unchanged when expiry_policy_type is 'never'", () => {
    const record = buildRecord({
      expiry_policy_type: "never",
      expires_at: null,
      expiry_status: "no_expiry",
      duration_months: null,
    });

    const result = evaluateExpiryStatus(record, now);

    expect(result).toBe(record); // same reference — unchanged
    expect(result.expiry_status).toBe("no_expiry");
  });

  it("returns record unchanged when expires_at is null", () => {
    const record = buildRecord({
      expires_at: null,
      expiry_status: "active",
    });

    const result = evaluateExpiryStatus(record, now);

    expect(result).toBe(record); // same reference — unchanged
    expect(result.expiry_status).toBe("active");
  });
});

// ---------------------------------------------------------------------------
// evaluateExpiryStatusBatch
// ---------------------------------------------------------------------------

describe("evaluateExpiryStatusBatch", () => {
  const now = new Date("2025-07-01T12:00:00.000Z");

  it("applies evaluation to all records in array", () => {
    const records = [
      buildRecord({
        id: "expired-link",
        expires_at: "2025-01-15T00:00:00.000Z",
        expiry_status: "active",
      }),
      buildRecord({
        id: "expiring-soon-link",
        expires_at: "2025-07-16T12:00:00.000Z",
        expiry_status: "active",
      }),
      buildRecord({
        id: "active-link",
        expires_at: "2026-06-01T00:00:00.000Z",
        expiry_status: "active",
      }),
      buildRecord({
        id: "never-link",
        expiry_policy_type: "never",
        expires_at: null,
        expiry_status: "no_expiry",
        duration_months: null,
      }),
    ];

    const results = evaluateExpiryStatusBatch(records, now);

    expect(results).toHaveLength(4);
    expect(results[0].expiry_status).toBe("expired");
    expect(results[1].expiry_status).toBe("expiring_soon");
    expect(results[2].expiry_status).toBe("active");
    expect(results[3].expiry_status).toBe("no_expiry");
  });
});
