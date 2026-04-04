import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { computeExpiry } from "../../src/shared/expiry-utils.js";

/**
 * Bug Condition Exploration Tests — Expiry Status on Write
 *
 * These tests encode the EXPECTED (correct) behavior for computeExpiry.
 * They are expected to FAIL on unfixed code because computeExpiry always
 * returns expiry_status: "active" for non-"never" policies — it never
 * compares expires_at against now.
 *
 * **Validates: Requirements 1.1, 1.2, 1.3, 1.4, 1.5**
 */

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

describe("Bug Condition: Expiry status incorrect at write time", () => {
  // -----------------------------------------------------------------------
  // Scoped concrete failing cases
  // -----------------------------------------------------------------------

  describe("Scoped concrete cases", () => {
    it("expired: custom_expires_at in the past returns 'expired'", () => {
      const result = computeExpiry({
        expiry_policy_type: "fixed",
        custom_expires_at: "2024-01-01T00:00:00.000Z",
        now: new Date("2024-06-15T12:00:00.000Z"),
      });

      expect(result.expiry_status).toBe("expired");
    });

    it("expiring soon: custom_expires_at 16 days away returns 'expiring_soon'", () => {
      const result = computeExpiry({
        expiry_policy_type: "fixed",
        custom_expires_at: "2024-07-01T00:00:00.000Z",
        now: new Date("2024-06-15T12:00:00.000Z"),
      });

      expect(result.expiry_status).toBe("expiring_soon");
    });

    it("expired via duration: created_at far in past with 1-month duration returns 'expired'", () => {
      const result = computeExpiry({
        expiry_policy_type: "fixed",
        duration_months: 1,
        created_at: "2023-01-01T00:00:00.000Z",
        now: new Date("2024-06-15T12:00:00.000Z"),
      });

      expect(result.expiry_status).toBe("expired");
    });

    it("expiring soon via duration: expires_at ~20 days from now returns 'expiring_soon'", () => {
      // created_at + 1 month should land ~20 days from now
      // now = 2024-06-15, created_at = 2024-06-05 → expires_at = 2024-07-05 (20 days away)
      const result = computeExpiry({
        expiry_policy_type: "fixed",
        duration_months: 1,
        created_at: "2024-06-05T00:00:00.000Z",
        now: new Date("2024-06-15T00:00:00.000Z"),
      });

      expect(result.expiry_status).toBe("expiring_soon");
    });
  });

  // -----------------------------------------------------------------------
  // Property-based tests
  // -----------------------------------------------------------------------

  describe("Property-based: random expired dates", () => {
    it("any custom_expires_at in the past relative to now → expiry_status == 'expired'", () => {
      fc.assert(
        fc.property(
          // Generate a random now between 2020 and 2030
          fc.integer({ min: 1577836800000, max: 1893456000000 }).map((ms) => new Date(ms)),
          // Generate a gap of 1 hour to 2 years in the past
          fc.integer({ min: 3600000, max: 2 * 365 * 24 * 60 * 60 * 1000 }),
          (now, gapMs) => {
            const expiresAt = new Date(now.getTime() - gapMs);
            const result = computeExpiry({
              expiry_policy_type: "fixed",
              custom_expires_at: expiresAt.toISOString(),
              now,
            });

            expect(result.expiry_status).toBe("expired");
          },
        ),
        { numRuns: 100 },
      );
    });
  });

  describe("Property-based: random expiring-soon dates", () => {
    it("any custom_expires_at within 30 days of now (but in the future) → expiry_status == 'expiring_soon'", () => {
      fc.assert(
        fc.property(
          // Generate a random now between 2020 and 2030
          fc.integer({ min: 1577836800000, max: 1893456000000 }).map((ms) => new Date(ms)),
          // Generate a gap of 1 ms to just under 30 days in the future
          fc.integer({ min: 1, max: THIRTY_DAYS_MS }),
          (now, gapMs) => {
            const expiresAt = new Date(now.getTime() + gapMs);
            const result = computeExpiry({
              expiry_policy_type: "fixed",
              custom_expires_at: expiresAt.toISOString(),
              now,
            });

            expect(result.expiry_status).toBe("expiring_soon");
          },
        ),
        { numRuns: 100 },
      );
    });
  });
});

// ---------------------------------------------------------------------------
// Preservation Property Tests — Unchanged Behavior for Never Policy and
// Far-Future Expiry
//
// These tests capture the EXISTING (correct) behavior of computeExpiry for
// inputs that are NOT affected by the bug. They must PASS on both unfixed
// and fixed code, serving as regression guards.
//
// **Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5**
// ---------------------------------------------------------------------------

describe("Preservation: Unchanged behavior for never policy and far-future expiry", () => {
  // -----------------------------------------------------------------------
  // Property 1: "never" policy always returns no_expiry
  // -----------------------------------------------------------------------

  describe("Property: never policy returns no_expiry for all now values", () => {
    it("for all random now values: 'never' policy returns expires_at: null, expiry_status: 'no_expiry', duration_months: null", () => {
      fc.assert(
        fc.property(
          // Random now between 2000 and 2040
          fc.integer({ min: 946684800000, max: 2208988800000 }).map((ms) => new Date(ms)),
          (now) => {
            const result = computeExpiry({ expiry_policy_type: "never", now });

            expect(result.expires_at).toBeNull();
            expect(result.expiry_status).toBe("no_expiry");
            expect(result.duration_months).toBeNull();
            expect(result.expiry_policy_type).toBe("never");
          },
        ),
        { numRuns: 100 },
      );
    });
  });

  // -----------------------------------------------------------------------
  // Property 2: Far-future expiry returns "active"
  // -----------------------------------------------------------------------

  describe("Property: far-future expires_at returns active status", () => {
    it("for all random configs where computed expires_at is more than 30 days from now: expiry_status is 'active'", () => {
      fc.assert(
        fc.property(
          // Random now between 2020 and 2030
          fc.integer({ min: 1577836800000, max: 1893456000000 }).map((ms) => new Date(ms)),
          // Gap more than 31 days into the future (to stay safely beyond 30-day boundary)
          fc.integer({ min: 31 * 24 * 60 * 60 * 1000, max: 5 * 365 * 24 * 60 * 60 * 1000 }),
          (now, gapMs) => {
            const customExpiresAt = new Date(now.getTime() + gapMs);
            const result = computeExpiry({
              expiry_policy_type: "fixed",
              custom_expires_at: customExpiresAt.toISOString(),
              now,
            });

            expect(result.expiry_status).toBe("active");
          },
        ),
        { numRuns: 100 },
      );
    });
  });

  // -----------------------------------------------------------------------
  // Property 3: Date arithmetic for duration_months is correct
  // -----------------------------------------------------------------------

  describe("Property: date arithmetic for created_at + duration_months", () => {
    it("for all random duration_months and created_at: expires_at equals created_at + months", () => {
      fc.assert(
        fc.property(
          // Random created_at between 2020 and 2030
          fc.integer({ min: 1577836800000, max: 1893456000000 }).map((ms) => new Date(ms)),
          // duration_months: 1, 3, or 12
          fc.constantFrom(1 as const, 3 as const, 12 as const),
          (createdAt, durationMonths) => {
            // Use a now that is close to created_at so expires_at will be far future
            const now = new Date(createdAt.getTime());
            const result = computeExpiry({
              expiry_policy_type: "fixed",
              duration_months: durationMonths,
              created_at: createdAt.toISOString(),
              now,
            });

            // Compute expected expires_at
            const expected = new Date(createdAt.getTime());
            expected.setUTCMonth(expected.getUTCMonth() + durationMonths);

            expect(result.expires_at).toBe(expected.toISOString());
            expect(result.duration_months).toBe(durationMonths);
            expect(result.expiry_policy_type).toBe("fixed");
          },
        ),
        { numRuns: 100 },
      );
    });
  });

  // -----------------------------------------------------------------------
  // Property 4: custom_expires_at passthrough
  // -----------------------------------------------------------------------

  describe("Property: custom_expires_at passthrough for far-future dates", () => {
    it("for all random custom_expires_at more than 30 days away: expires_at equals the custom date directly", () => {
      fc.assert(
        fc.property(
          // Random now between 2020 and 2030
          fc.integer({ min: 1577836800000, max: 1893456000000 }).map((ms) => new Date(ms)),
          // Gap more than 31 days into the future
          fc.integer({ min: 31 * 24 * 60 * 60 * 1000, max: 5 * 365 * 24 * 60 * 60 * 1000 }),
          (now, gapMs) => {
            const customDate = new Date(now.getTime() + gapMs);
            const customIso = customDate.toISOString();
            const result = computeExpiry({
              expiry_policy_type: "fixed",
              custom_expires_at: customIso,
              now,
            });

            expect(result.expires_at).toBe(customIso);
            expect(result.duration_months).toBeNull();
            expect(result.expiry_policy_type).toBe("fixed");
          },
        ),
        { numRuns: 100 },
      );
    });
  });

  // -----------------------------------------------------------------------
  // Property 5: Inactivity policy computes expires_at as now + 12 months
  // -----------------------------------------------------------------------

  describe("Property: inactivity policy computes expires_at as now + 12 months", () => {
    it("for all random now with 'inactivity' policy: expires_at equals now + 12 months", () => {
      fc.assert(
        fc.property(
          // Random now between 2020 and 2030
          fc.integer({ min: 1577836800000, max: 1893456000000 }).map((ms) => new Date(ms)),
          (now) => {
            const result = computeExpiry({ expiry_policy_type: "inactivity", now });

            // Compute expected: now + 12 months
            const expected = new Date(now.getTime());
            expected.setUTCMonth(expected.getUTCMonth() + 12);

            expect(result.expires_at).toBe(expected.toISOString());
            expect(result.expiry_status).toBe("active");
            expect(result.expiry_policy_type).toBe("inactivity");
            expect(result.duration_months).toBeNull();
          },
        ),
        { numRuns: 100 },
      );
    });
  });
});
