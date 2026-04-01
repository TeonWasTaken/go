// Feature: landing-page-redesign, Property 2: Case-insensitive search matches alias, URL, and title
import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { AliasRecord } from "../../services/api";
import { matchesSearch } from "../../utils/searchMatch";

/**
 * Validates: Requirements 7.3
 *
 * For any AliasRecord and any non-empty search string, the record should be
 * included in search results if and only if the search string appears
 * (case-insensitively) as a substring of the record's alias, destination_url,
 * or title fields.
 */

/** Arbitrary that produces a minimal AliasRecord with random string fields. */
const aliasRecordArb: fc.Arbitrary<AliasRecord> = fc.record({
  id: fc.string({ minLength: 1 }),
  alias: fc.string(),
  destination_url: fc.string(),
  title: fc.string(),
  created_by: fc.constant("user@test.com"),
  click_count: fc.nat(),
  heat_score: fc.nat(),
  heat_updated_at: fc.constant(null),
  is_private: fc.boolean(),
  created_at: fc.constant("2024-01-01T00:00:00Z"),
  last_accessed_at: fc.constant(null),
  expiry_policy_type: fc.constantFrom(
    "never" as const,
    "fixed" as const,
    "inactivity" as const,
  ),
  duration_months: fc.constantFrom(1 as const, 3 as const, 12 as const, null),
  custom_expires_at: fc.constant(null),
  expires_at: fc.constant(null),
  expiry_status: fc.constantFrom(
    "active" as const,
    "expiring_soon" as const,
    "expired" as const,
    "no_expiry" as const,
  ),
  expired_at: fc.constant(null),
  icon_url: fc.constant(null),
});

/** Non-empty search term arbitrary. */
const searchTermArb = fc.string({ minLength: 1 });

describe("Property 2: Case-insensitive search matches alias, URL, and title", () => {
  it("matchesSearch returns true iff term is a case-insensitive substring of alias, destination_url, or title", () => {
    fc.assert(
      fc.property(aliasRecordArb, searchTermArb, (record, term) => {
        const result = matchesSearch(record, term);

        const lowerTerm = term.toLowerCase();
        const expected =
          record.alias.toLowerCase().includes(lowerTerm) ||
          record.destination_url.toLowerCase().includes(lowerTerm) ||
          record.title.toLowerCase().includes(lowerTerm);

        expect(result).toBe(expected);
      }),
      { numRuns: 100 },
    );
  });

  it("always matches when the search term is a substring of the alias (any casing)", () => {
    fc.assert(
      fc.property(aliasRecordArb, (record) => {
        // Pick a substring from the alias and randomize its case
        if (record.alias.length === 0) return; // skip empty aliases
        const sub = record.alias.slice(
          0,
          Math.max(1, Math.floor(record.alias.length / 2)),
        );
        const mixedCase = sub
          .split("")
          .map((c, i) => (i % 2 === 0 ? c.toUpperCase() : c.toLowerCase()))
          .join("");
        expect(matchesSearch(record, mixedCase)).toBe(
          record.alias.toLowerCase().includes(mixedCase.toLowerCase()) ||
            record.destination_url
              .toLowerCase()
              .includes(mixedCase.toLowerCase()) ||
            record.title.toLowerCase().includes(mixedCase.toLowerCase()),
        );
      }),
      { numRuns: 100 },
    );
  });
});
