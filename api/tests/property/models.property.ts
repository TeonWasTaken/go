import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  generateAliasId,
  validateAlias,
  validateCreateAliasRequest,
  validateDestinationUrl,
  validateExpiryPolicy,
  validateFixedPolicyConfig,
  validateUpdateAliasRequest,
  type AliasRecord,
} from "../../src/shared/models.js";

const validAliasArb = fc.stringOf(
  fc.mapToConstant(
    { num: 26, build: (v: number) => String.fromCharCode(97 + v) },
    { num: 10, build: (v: number) => String.fromCharCode(48 + v) },
    { num: 1, build: () => "-" },
  ),
  { minLength: 1, maxLength: 30 },
);
const invalidAliasArb = fc.oneof(
  fc.constant(""),
  fc
    .stringOf(fc.char(), { minLength: 1 })
    .filter((s) => !/^[a-z0-9-]+$/.test(s)),
);
const validUrlArb = fc.webUrl({
  withFragments: false,
  withQueryParameters: false,
});
const invalidUrlArb = fc.oneof(
  fc.constant(""),
  fc.constant("not-a-url"),
  fc.constant("ftp//missing-colon"),
  fc.stringOf(fc.char(), { minLength: 1 }).filter((s) => {
    try {
      new URL(s);
      return false;
    } catch {
      return true;
    }
  }),
);
const validDurationArb = fc.constantFrom(1 as const, 3 as const, 12 as const);
const invalidDurationArb = fc
  .integer({ min: -100, max: 100 })
  .filter((n) => n !== 1 && n !== 3 && n !== 12);
const futureIsoArb = fc
  .integer({ min: Date.now() + 60_000, max: 2524608000000 })
  .map((ms) => new Date(ms).toISOString());
const pastIsoArb = fc
  .integer({ min: 946684800000, max: Date.now() - 60_000 })
  .map((ms) => new Date(ms).toISOString());
const emailArb = fc
  .tuple(
    fc
      .stringOf(fc.char(), { minLength: 1, maxLength: 10 })
      .filter((s) => s.length > 0 && !s.includes("@")),
    fc
      .stringOf(fc.char(), { minLength: 1, maxLength: 8 })
      .filter((s) => s.length > 0 && !s.includes("@")),
  )
  .map(([l, d]) => `${l}@${d}.com`);
const expiryPolicyTypeArb = fc.constantFrom(
  "never" as const,
  "fixed" as const,
  "inactivity" as const,
);
const invalidExpiryTypeArb = fc
  .stringOf(fc.char(), { minLength: 1, maxLength: 15 })
  .filter((s) => !["never", "fixed", "inactivity"].includes(s));
const titleArb = fc.string({ minLength: 1, maxLength: 50 });

function buildRecord(overrides: Partial<AliasRecord> = {}): AliasRecord {
  const alias = overrides.alias ?? "test-alias";
  const isPrivate = overrides.is_private ?? false;
  const createdBy = overrides.created_by ?? "user@example.com";
  return {
    id: generateAliasId(alias, isPrivate, createdBy),
    alias,
    destination_url: "https://example.com",
    created_by: createdBy,
    title: "Test",
    click_count: 0,
    heat_score: 0,
    heat_updated_at: null,
    is_private: isPrivate,
    created_at: new Date().toISOString(),
    last_accessed_at: null,
    expiry_policy_type: "fixed",
    duration_months: 12,
    custom_expires_at: null,
    expires_at: new Date(Date.now() + 365 * 86400000).toISOString(),
    expiry_status: "active",
    expired_at: null,
    ...overrides,
  };
}

// Property 17: Alias record invariants (Req 5.2, 5.3, 5.4, 5.5, 2.10, 6.4, 15.1, 15.11)
describe("Property 17: Alias record invariants", () => {
  it("alias field is always lowercase", () => {
    fc.assert(
      fc.property(validAliasArb, (alias) => {
        const r = buildRecord({ alias });
        expect(r.alias).toBe(r.alias.toLowerCase());
      }),
      { numRuns: 200 },
    );
  });
  it("global alias id equals the alias name", () => {
    fc.assert(
      fc.property(validAliasArb, emailArb, (alias, email) => {
        expect(generateAliasId(alias, false, email)).toBe(alias);
      }),
      { numRuns: 200 },
    );
  });
  it("private alias id equals {alias}:{created_by}", () => {
    fc.assert(
      fc.property(validAliasArb, emailArb, (alias, email) => {
        expect(generateAliasId(alias, true, email)).toBe(`${alias}:${email}`);
      }),
      { numRuns: 200 },
    );
  });
  it("all required fields are present on a well-formed record", () => {
    fc.assert(
      fc.property(
        validAliasArb,
        emailArb,
        fc.boolean(),
        expiryPolicyTypeArb,
        (alias, email, isPrivate, policyType) => {
          const record = buildRecord({
            alias,
            created_by: email,
            is_private: isPrivate,
            expiry_policy_type: policyType,
          });
          const fields: (keyof AliasRecord)[] = [
            "id",
            "alias",
            "destination_url",
            "created_by",
            "title",
            "click_count",
            "heat_score",
            "is_private",
            "created_at",
            "expiry_policy_type",
            "expiry_status",
          ];
          for (const f of fields) {
            expect(record[f]).toBeDefined();
          }
          expect(typeof record.click_count).toBe("number");
          expect(typeof record.heat_score).toBe("number");
          expect("last_accessed_at" in record).toBe(true);
        },
      ),
      { numRuns: 100 },
    );
  });
  it("heat_score is non-negative", () => {
    fc.assert(
      fc.property(fc.float({ min: 0, max: 1e6, noNaN: true }), (heat) => {
        expect(
          buildRecord({ heat_score: heat }).heat_score,
        ).toBeGreaterThanOrEqual(0);
      }),
      { numRuns: 200 },
    );
  });
});

// Property 10: Invalid inputs are rejected with 400 (Req 2.11, 2.12, 2.13)
describe("Property 10: Invalid inputs are rejected with 400", () => {
  it("invalid alias format is always rejected", () => {
    fc.assert(
      fc.property(invalidAliasArb, (alias) => {
        expect(validateAlias(alias).valid).toBe(false);
      }),
      { numRuns: 200 },
    );
  });
  it("valid alias format is always accepted", () => {
    fc.assert(
      fc.property(validAliasArb, (alias) => {
        expect(validateAlias(alias).valid).toBe(true);
      }),
      { numRuns: 200 },
    );
  });
  it("invalid destination URL is always rejected", () => {
    fc.assert(
      fc.property(invalidUrlArb, (url) => {
        expect(validateDestinationUrl(url).valid).toBe(false);
      }),
      { numRuns: 100 },
    );
  });
  it("valid destination URL is always accepted", () => {
    fc.assert(
      fc.property(validUrlArb, (url) => {
        expect(validateDestinationUrl(url).valid).toBe(true);
      }),
      { numRuns: 100 },
    );
  });
  it("invalid expiry policy type is always rejected", () => {
    fc.assert(
      fc.property(invalidExpiryTypeArb, (pt) => {
        expect(validateExpiryPolicy(pt, undefined, undefined).valid).toBe(
          false,
        );
      }),
      { numRuns: 200 },
    );
  });
  it("create request with invalid alias is rejected", () => {
    fc.assert(
      fc.property(
        invalidAliasArb,
        titleArb,
        validUrlArb,
        (alias, title, url) => {
          expect(
            validateCreateAliasRequest({ alias, destination_url: url, title })
              .valid,
          ).toBe(false);
        },
      ),
      { numRuns: 100 },
    );
  });
  it("create request with invalid URL is rejected", () => {
    fc.assert(
      fc.property(
        validAliasArb,
        titleArb,
        invalidUrlArb,
        (alias, title, url) => {
          expect(
            validateCreateAliasRequest({ alias, destination_url: url, title })
              .valid,
          ).toBe(false);
        },
      ),
      { numRuns: 100 },
    );
  });
  it("update request with invalid URL is rejected", () => {
    fc.assert(
      fc.property(invalidUrlArb, (url) => {
        expect(validateUpdateAliasRequest({ destination_url: url }).valid).toBe(
          false,
        );
      }),
      { numRuns: 100 },
    );
  });
  it("update request with invalid expiry policy type is rejected", () => {
    fc.assert(
      fc.property(invalidExpiryTypeArb, (pt) => {
        expect(
          validateUpdateAliasRequest({ expiry_policy_type: pt as any }).valid,
        ).toBe(false);
      }),
      { numRuns: 100 },
    );
  });
});

// Property 11: Fixed expiry policy accepts valid configurations only (Req 2.14)
describe("Property 11: Fixed expiry policy accepts valid configurations only", () => {
  it("fixed policy with valid duration_months is accepted", () => {
    fc.assert(
      fc.property(validDurationArb, (d) => {
        expect(validateFixedPolicyConfig(d, undefined).valid).toBe(true);
      }),
      { numRuns: 50 },
    );
  });
  it("fixed policy with invalid duration_months is rejected", () => {
    fc.assert(
      fc.property(invalidDurationArb, (d) => {
        expect(validateFixedPolicyConfig(d, undefined).valid).toBe(false);
      }),
      { numRuns: 200 },
    );
  });
  it("fixed policy with future custom_expires_at is accepted", () => {
    fc.assert(
      fc.property(futureIsoArb, (d) => {
        expect(validateFixedPolicyConfig(undefined, d).valid).toBe(true);
      }),
      { numRuns: 100 },
    );
  });
  it("fixed policy with past custom_expires_at is rejected", () => {
    fc.assert(
      fc.property(pastIsoArb, (d) => {
        expect(validateFixedPolicyConfig(undefined, d).valid).toBe(false);
      }),
      { numRuns: 100 },
    );
  });
  it("fixed policy with both duration and custom date is rejected", () => {
    fc.assert(
      fc.property(validDurationArb, futureIsoArb, (d, c) => {
        expect(validateFixedPolicyConfig(d, c).valid).toBe(false);
      }),
      { numRuns: 100 },
    );
  });
  it("fixed policy with neither duration nor custom date is rejected", () => {
    expect(validateFixedPolicyConfig(undefined, undefined).valid).toBe(false);
  });
  it("fixed expiry via full create request validates correctly", () => {
    fc.assert(
      fc.property(
        validAliasArb,
        validUrlArb,
        titleArb,
        validDurationArb,
        (alias, url, title, duration) => {
          expect(
            validateCreateAliasRequest({
              alias,
              destination_url: url,
              title,
              expiry_policy_type: "fixed",
              duration_months: duration,
            }).valid,
          ).toBe(true);
        },
      ),
      { numRuns: 100 },
    );
  });
  it("fixed expiry via full create request rejects both duration and custom date", () => {
    fc.assert(
      fc.property(
        validAliasArb,
        validUrlArb,
        titleArb,
        validDurationArb,
        futureIsoArb,
        (alias, url, title, duration, customDate) => {
          expect(
            validateCreateAliasRequest({
              alias,
              destination_url: url,
              title,
              expiry_policy_type: "fixed",
              duration_months: duration,
              custom_expires_at: customDate,
            }).valid,
          ).toBe(false);
        },
      ),
      { numRuns: 100 },
    );
  });
});
