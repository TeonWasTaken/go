import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { evaluateExpiryStatus } from "../../src/shared/expiry-utils.js";
import type { AliasRecord } from "../../src/shared/models.js";

/**
 * Bug Condition Exploration Test — Expiry Processor Stale Status
 *
 * Property 1: Bug Condition — Read-Time Expiry Evaluation Corrects Stale Status
 *
 * These tests encode the EXPECTED (correct) behavior for evaluateExpiryStatus.
 * They are expected to FAIL on unfixed code because evaluateExpiryStatus does
 * not exist yet — the import will fail, confirming that no read-time evaluation
 * mechanism exists.
 *
 * **Validates: Requirements 1.1, 1.2, 1.3, 1.4, 2.1, 2.2, 2.3**
 */

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

// ---------------------------------------------------------------------------
// Generators
// ---------------------------------------------------------------------------

/** Generate a random `now` between 2020 and 2030 */
const nowArb: fc.Arbitrary<Date> = fc
  .integer({ min: 1577836800000, max: 1893456000000 })
  .map((ms) => new Date(ms));

/** Base AliasRecord template with sensible defaults */
function baseRecord(overrides: Partial<AliasRecord>): AliasRecord {
  return {
    id: "test-id",
    alias: "test-alias",
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
    duration_months: null,
    custom_expires_at: null,
    expires_at: null,
    expiry_status: "active",
    expired_at: null,
    icon_url: null,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Bug Condition Exploration Tests
// ---------------------------------------------------------------------------

describe("Property 1: Bug Condition — Read-Time Expiry Evaluation Corrects Stale Status", () => {
  // -----------------------------------------------------------------------
  // Case 1: expires_at is in the past AND stored expiry_status is NOT "expired"
  // → evaluateExpiryStatus should return "expired"
  // -----------------------------------------------------------------------

  describe("Case 1: Past expires_at with stale non-expired status", () => {
    it("for any record where expires_at is in the past and stored status is not 'expired', evaluateExpiryStatus returns 'expired'", () => {
      fc.assert(
        fc.property(
          nowArb,
          // Gap of 1 hour to 2 years in the past
          fc.integer({ min: 3600000, max: 2 * 365 * 24 * 60 * 60 * 1000 }),
          // Stale status: anything except "expired"
          fc.constantFrom("active" as const, "expiring_soon" as const),
          (now, gapMs, staleStatus) => {
            const expiresAt = new Date(now.getTime() - gapMs);
            const record = baseRecord({
              expires_at: expiresAt.toISOString(),
              expiry_status: staleStatus,
              expiry_policy_type: "fixed",
            });

            const result = evaluateExpiryStatus(record, now);

            expect(result.expiry_status).toBe("expired");
          },
        ),
        { numRuns: 100 },
      );
    });
  });

  // -----------------------------------------------------------------------
  // Case 2: expires_at is within 30 days of now AND stored expiry_status is "active"
  // → evaluateExpiryStatus should return "expiring_soon"
  // -----------------------------------------------------------------------

  describe("Case 2: Expiring-soon expires_at with stale 'active' status", () => {
    it("for any record where expires_at is within 30 days and stored status is 'active', evaluateExpiryStatus returns 'expiring_soon'", () => {
      fc.assert(
        fc.property(
          nowArb,
          // Gap of 1 ms to 30 days in the future (within the expiring_soon window)
          fc.integer({ min: 1, max: THIRTY_DAYS_MS }),
          (now, gapMs) => {
            const expiresAt = new Date(now.getTime() + gapMs);
            const record = baseRecord({
              expires_at: expiresAt.toISOString(),
              expiry_status: "active",
              expiry_policy_type: "fixed",
            });

            const result = evaluateExpiryStatus(record, now);

            expect(result.expiry_status).toBe("expiring_soon");
          },
        ),
        { numRuns: 100 },
      );
    });
  });
});


// ---------------------------------------------------------------------------
// Preservation Property Tests
// ---------------------------------------------------------------------------

describe("Property 2: Preservation — Non-Expirable and Future-Expiry Records Unchanged", () => {
  /**
   * **Validates: Requirements 2.4, 3.1, 3.2**
   *
   * For records where the bug condition does NOT hold, evaluateExpiryStatus
   * must return the record with expiry_status unchanged. This covers:
   * - Records with expiry_policy_type "never" → expiry_status stays "no_expiry"
   * - Records with expires_at null → expiry_status unchanged
   * - Records with expires_at more than 30 days in the future → expiry_status "active"
   * - Records where stored expiry_status already matches real-time evaluation → unchanged
   */

  // -----------------------------------------------------------------------
  // Case 1: expiry_policy_type is "never" → expiry_status stays "no_expiry"
  // -----------------------------------------------------------------------

  describe('Case 1: Records with expiry_policy_type "never"', () => {
    it('for any record with expiry_policy_type "never", evaluateExpiryStatus returns expiry_status "no_expiry" unchanged', () => {
      fc.assert(
        fc.property(nowArb, (now) => {
          const record = baseRecord({
            expiry_policy_type: "never",
            expires_at: null,
            expiry_status: "no_expiry",
            duration_months: null,
          });

          const result = evaluateExpiryStatus(record, now);

          expect(result.expiry_status).toBe("no_expiry");
          // The record should be returned unchanged
          expect(result.expires_at).toBe(record.expires_at);
          expect(result.expiry_policy_type).toBe("never");
        }),
        { numRuns: 100 },
      );
    });
  });

  // -----------------------------------------------------------------------
  // Case 2: expires_at is null → expiry_status unchanged
  // -----------------------------------------------------------------------

  describe("Case 2: Records with expires_at null", () => {
    it("for any record with expires_at null, evaluateExpiryStatus returns the record with expiry_status unchanged", () => {
      fc.assert(
        fc.property(
          nowArb,
          fc.constantFrom(
            "active" as const,
            "expiring_soon" as const,
            "expired" as const,
            "no_expiry" as const,
          ),
          (now, storedStatus) => {
            const record = baseRecord({
              expires_at: null,
              expiry_status: storedStatus,
            });

            const result = evaluateExpiryStatus(record, now);

            expect(result.expiry_status).toBe(storedStatus);
          },
        ),
        { numRuns: 100 },
      );
    });
  });

  // -----------------------------------------------------------------------
  // Case 3: expires_at more than 30 days in the future → expiry_status "active"
  // -----------------------------------------------------------------------

  describe("Case 3: Records with expires_at more than 30 days in the future", () => {
    it('for any record with expires_at more than 30 days in the future, evaluateExpiryStatus returns expiry_status "active"', () => {
      fc.assert(
        fc.property(
          nowArb,
          // Gap of 30 days + 1 hour to 2 years in the future
          fc.integer({
            min: THIRTY_DAYS_MS + 3600000,
            max: 2 * 365 * 24 * 60 * 60 * 1000,
          }),
          (now, gapMs) => {
            const expiresAt = new Date(now.getTime() + gapMs);
            const record = baseRecord({
              expires_at: expiresAt.toISOString(),
              expiry_status: "active",
              expiry_policy_type: "fixed",
            });

            const result = evaluateExpiryStatus(record, now);

            expect(result.expiry_status).toBe("active");
          },
        ),
        { numRuns: 100 },
      );
    });
  });

  // -----------------------------------------------------------------------
  // Case 4: Stored expiry_status already matches real-time evaluation → unchanged
  // -----------------------------------------------------------------------

  describe("Case 4: Records where stored expiry_status already matches real-time evaluation", () => {
    it('for a record with expires_at in the past and stored status "expired", evaluateExpiryStatus returns "expired" unchanged', () => {
      fc.assert(
        fc.property(
          nowArb,
          fc.integer({ min: 3600000, max: 2 * 365 * 24 * 60 * 60 * 1000 }),
          (now, gapMs) => {
            const expiresAt = new Date(now.getTime() - gapMs);
            const record = baseRecord({
              expires_at: expiresAt.toISOString(),
              expiry_status: "expired",
              expiry_policy_type: "fixed",
            });

            const result = evaluateExpiryStatus(record, now);

            expect(result.expiry_status).toBe("expired");
          },
        ),
        { numRuns: 100 },
      );
    });

    it('for a record with expires_at within 30 days and stored status "expiring_soon", evaluateExpiryStatus returns "expiring_soon" unchanged', () => {
      fc.assert(
        fc.property(
          nowArb,
          fc.integer({ min: 1, max: THIRTY_DAYS_MS }),
          (now, gapMs) => {
            const expiresAt = new Date(now.getTime() + gapMs);
            const record = baseRecord({
              expires_at: expiresAt.toISOString(),
              expiry_status: "expiring_soon",
              expiry_policy_type: "fixed",
            });

            const result = evaluateExpiryStatus(record, now);

            expect(result.expiry_status).toBe("expiring_soon");
          },
        ),
        { numRuns: 100 },
      );
    });

    it('for a record with expires_at more than 30 days out and stored status "active", evaluateExpiryStatus returns "active" unchanged', () => {
      fc.assert(
        fc.property(
          nowArb,
          fc.integer({
            min: THIRTY_DAYS_MS + 3600000,
            max: 2 * 365 * 24 * 60 * 60 * 1000,
          }),
          (now, gapMs) => {
            const expiresAt = new Date(now.getTime() + gapMs);
            const record = baseRecord({
              expires_at: expiresAt.toISOString(),
              expiry_status: "active",
              expiry_policy_type: "fixed",
            });

            const result = evaluateExpiryStatus(record, now);

            expect(result.expiry_status).toBe("active");
          },
        ),
        { numRuns: 100 },
      );
    });
  });
});
