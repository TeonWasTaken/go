import fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { DurationMonths } from "../../src/shared/expiry-utils.js";
import { computeExpiry } from "../../src/shared/expiry-utils.js";

// --- Helpers ---

function expectedAddMonths(date: Date, months: number): Date {
  const result = new Date(date.getTime());
  result.setUTCMonth(result.getUTCMonth() + months);
  return result;
}

// --- Generators ---

/** Generate a valid duration_months value: 1, 3, or 12 */
const durationMonthsArb: fc.Arbitrary<DurationMonths> = fc.constantFrom(
  1 as DurationMonths,
  3 as DurationMonths,
  12 as DurationMonths,
);

/** Generate a random valid Date within a reasonable range (2000-2040) */
const dateArb: fc.Arbitrary<Date> = fc
  .integer({ min: 946684800000, max: 2208988800000 })
  .map((ms) => new Date(ms));

/** Generate a random future ISO 8601 date string (relative to a far-past base) */
const customExpiresAtArb: fc.Arbitrary<string> = fc
  .integer({ min: Date.now(), max: 2524608000000 })
  .map((ms) => new Date(ms).toISOString());

/** Generate a random past ISO 8601 date string */
const createdAtArb: fc.Arbitrary<string> = fc
  .integer({ min: 946684800000, max: Date.now() })
  .map((ms) => new Date(ms).toISOString());

// Feature: go-url-alias-service, Property 12: Expiry timestamp is computed correctly from policy
describe("Property 12: Expiry timestamp is computed correctly from policy", () => {
  /**
   * **Validates: Requirements 9.2, 9.3, 9.4, 9.5, 2.15**
   *
   * For any alias record:
   * - If `expiry_policy_type` is `never`, then `expires_at` should be null and `expiry_status` should be `no_expiry`
   * - If `expiry_policy_type` is `fixed` with `duration_months`, then `expires_at` should equal the creation time plus that many months
   * - If `expiry_policy_type` is `fixed` with `custom_expires_at`, then `expires_at` should equal the custom date
   * - If `expiry_policy_type` is `inactivity`, then `expires_at` should be 12 months from the current UTC time
   */

  it('"never" policy always produces null expires_at and no_expiry status', () => {
    fc.assert(
      fc.property(dateArb, (now) => {
        const result = computeExpiry({ expiry_policy_type: "never", now });

        expect(result.expires_at).toBeNull();
        expect(result.expiry_status).toBe("no_expiry");
        expect(result.expiry_policy_type).toBe("never");
        expect(result.duration_months).toBeNull();
      }),
      { numRuns: 100 },
    );
  });

  it('"fixed" policy with duration_months produces expires_at = created_at + duration months', () => {
    fc.assert(
      fc.property(
        durationMonthsArb,
        dateArb,
        dateArb,
        (duration, createdDate, now) => {
          const createdAt = createdDate.toISOString();
          const result = computeExpiry({
            expiry_policy_type: "fixed",
            duration_months: duration,
            created_at: createdAt,
            now,
          });

          const expected = expectedAddMonths(createdDate, duration);

          expect(result.expires_at).toBe(expected.toISOString());
          // Status depends on how far expires_at is from now
          const expiresAtMs = expected.getTime();
          const nowMs = now.getTime();
          const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
          if (expiresAtMs <= nowMs) {
            expect(result.expiry_status).toBe("expired");
          } else if (expiresAtMs - nowMs <= THIRTY_DAYS_MS) {
            expect(result.expiry_status).toBe("expiring_soon");
          } else {
            expect(result.expiry_status).toBe("active");
          }
          expect(result.expiry_policy_type).toBe("fixed");
          expect(result.duration_months).toBe(duration);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('"fixed" policy with custom_expires_at uses the provided date directly', () => {
    fc.assert(
      fc.property(customExpiresAtArb, dateArb, (customDate, now) => {
        const result = computeExpiry({
          expiry_policy_type: "fixed",
          custom_expires_at: customDate,
          now,
        });

        expect(result.expires_at).toBe(customDate);
        // Status depends on how far custom_expires_at is from now
        const expiresAtMs = new Date(customDate).getTime();
        const nowMs = now.getTime();
        const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
        if (expiresAtMs <= nowMs) {
          expect(result.expiry_status).toBe("expired");
        } else if (expiresAtMs - nowMs <= THIRTY_DAYS_MS) {
          expect(result.expiry_status).toBe("expiring_soon");
        } else {
          expect(result.expiry_status).toBe("active");
        }
        expect(result.expiry_policy_type).toBe("fixed");
        expect(result.duration_months).toBeNull();
      }),
      { numRuns: 100 },
    );
  });

  it('"inactivity" policy produces expires_at = now + 12 months', () => {
    fc.assert(
      fc.property(dateArb, (now) => {
        const result = computeExpiry({
          expiry_policy_type: "inactivity",
          now,
        });

        const expected = expectedAddMonths(now, 12);

        expect(result.expires_at).toBe(expected.toISOString());
        expect(result.expiry_status).toBe("active");
        expect(result.expiry_policy_type).toBe("inactivity");
        expect(result.duration_months).toBeNull();
      }),
      { numRuns: 100 },
    );
  });

  it('default (no policy provided) behaves as "fixed" with duration_months 12', () => {
    fc.assert(
      fc.property(dateArb, (now) => {
        const result = computeExpiry({ now });

        const expected = expectedAddMonths(now, 12);

        expect(result.expires_at).toBe(expected.toISOString());
        expect(result.expiry_status).toBe("active");
        expect(result.expiry_policy_type).toBe("fixed");
        expect(result.duration_months).toBe(12);
      }),
      { numRuns: 100 },
    );
  });
});
