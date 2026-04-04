/**
 * Property tests for the Expiry Processor Azure Function.
 *
 * Property 18: Expiry state machine transitions are correct
 * Property 21: Expiry processor summary matches actual transitions
 */

import fc from "fast-check";
import { describe, expect, it, vi } from "vitest";
import type { AliasRecord } from "../../src/shared/models.js";

// Mock @azure/functions before importing the module under test
vi.mock("@azure/functions", () => ({
  app: { timer: vi.fn() },
}));

import { processExpiryRecords } from "../../src/functions/expiryProcessor.js";

// ---------------------------------------------------------------------------
// Constants (mirrored from implementation for clarity)
// ---------------------------------------------------------------------------

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
const FOURTEEN_DAYS_MS = 14 * 24 * 60 * 60 * 1000;

// ---------------------------------------------------------------------------
// Generators
// ---------------------------------------------------------------------------

const aliasArb = fc
  .stringOf(fc.constantFrom(..."abcdefghijklmnopqrstuvwxyz0123456789-"), {
    minLength: 1,
    maxLength: 20,
  })
  .filter((s) => /^[a-z0-9-]+$/.test(s));

const emailArb = fc
  .tuple(
    fc.stringOf(fc.constantFrom(..."abcdefghijklmnopqrstuvwxyz0123456789"), {
      minLength: 1,
      maxLength: 8,
    }),
    fc.constantFrom("example.com", "test.org"),
  )
  .map(([user, domain]) => `${user}@${domain}`);

/** A "now" date in a reasonable range */
const nowArb = fc
  .integer({ min: 1704067200000, max: 1893456000000 })
  .map((ms) => new Date(ms));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRecord(
  overrides: Partial<AliasRecord> & { alias: string },
): AliasRecord {
  return {
    id: overrides.id ?? overrides.alias,
    alias: overrides.alias,
    destination_url: "https://example.com",
    created_by: overrides.created_by ?? "user@example.com",
    title: "Test",
    click_count: 0,
    heat_score: 0,
    heat_updated_at: null,
    is_private: overrides.is_private ?? false,
    created_at: new Date(Date.now() - 86400_000 * 60).toISOString(),
    last_accessed_at: null,
    expiry_policy_type: overrides.expiry_policy_type ?? "fixed",
    duration_months: overrides.duration_months ?? 12,
    custom_expires_at: null,
    expires_at: overrides.expires_at ?? null,
    expiry_status: overrides.expiry_status ?? "active",
    expired_at: overrides.expired_at ?? null,
  };
}

/**
 * Create mock deps that track calls for assertions.
 */
function makeDeps() {
  const updated: AliasRecord[] = [];
  const deleted: { alias: string; id: string }[] = [];
  return {
    deps: {
      updateAlias: async (record: AliasRecord) => {
        updated.push({ ...record });
        return record;
      },
      deleteAlias: async (alias: string, id: string) => {
        deleted.push({ alias, id });
      },
    },
    updated,
    deleted,
  };
}

// Feature: go-url-alias-service, Property 18: Expiry state machine transitions are correct
describe("Property 18: Expiry state machine transitions are correct", () => {
  /**
   * Validates: Requirements 10.1, 10.2, 10.5, 11.2, 11.3, 11.4, 11.5
   *
   * For any set of alias records where expiry_policy_type is not 'never':
   * - Records with expires_at within 30 days and status 'active' → 'expiring_soon'
   * - Records with expires_at in the past and status not 'expired' → 'expired' with expired_at set
   * - Records with status 'expired' and expired_at older than 14 days → permanently deleted
   * - Records with expiry_policy_type 'never' should not be evaluated
   */

  it("active records within 30 days of expiry transition to expiring_soon", async () => {
    await fc.assert(
      fc.asyncProperty(
        aliasArb,
        nowArb,
        // days until expiry: 0 < days <= 30
        fc.integer({ min: 1, max: 30 }),
        async (alias, now, daysUntil) => {
          const expiresAt = new Date(
            now.getTime() + daysUntil * 24 * 60 * 60 * 1000 - 1000,
          );
          const record = makeRecord({
            alias,
            expires_at: expiresAt.toISOString(),
            expiry_status: "active",
            expiry_policy_type: "fixed",
          });

          const { deps, updated } = makeDeps();
          await processExpiryRecords([record], now, deps);

          expect(updated).toHaveLength(1);
          expect(updated[0].expiry_status).toBe("expiring_soon");
        },
      ),
      { numRuns: 100 },
    );
  });

  it("records past expires_at with status not expired transition to expired", async () => {
    await fc.assert(
      fc.asyncProperty(
        aliasArb,
        nowArb,
        fc.constantFrom("active" as const, "expiring_soon" as const),
        // hours past expiry
        fc.integer({ min: 1, max: 720 }),
        async (alias, now, status, hoursPast) => {
          const expiresAt = new Date(
            now.getTime() - hoursPast * 60 * 60 * 1000,
          );
          const record = makeRecord({
            alias,
            expires_at: expiresAt.toISOString(),
            expiry_status: status,
            expiry_policy_type: "fixed",
          });

          const { deps, updated } = makeDeps();
          await processExpiryRecords([record], now, deps);

          expect(updated).toHaveLength(1);
          expect(updated[0].expiry_status).toBe("expired");
          expect(updated[0].expired_at).toBe(now.toISOString());
        },
      ),
      { numRuns: 100 },
    );
  });

  it("expired records past 14-day grace period are permanently deleted", async () => {
    await fc.assert(
      fc.asyncProperty(
        aliasArb,
        nowArb,
        // days past grace period
        fc.integer({ min: 15, max: 60 }),
        async (alias, now, daysPastExpired) => {
          const expiredAt = new Date(
            now.getTime() - daysPastExpired * 24 * 60 * 60 * 1000,
          );
          const record = makeRecord({
            alias,
            expires_at: new Date(expiredAt.getTime() - 86400_000).toISOString(),
            expiry_status: "expired",
            expired_at: expiredAt.toISOString(),
            expiry_policy_type: "fixed",
          });

          const { deps, deleted } = makeDeps();
          await processExpiryRecords([record], now, deps);

          expect(deleted).toHaveLength(1);
          expect(deleted[0].alias).toBe(alias);
          expect(deleted[0].id).toBe(record.id);
        },
      ),
      { numRuns: 100 },
    );
  });

  it("expired records within 14-day grace period are NOT deleted", async () => {
    await fc.assert(
      fc.asyncProperty(
        aliasArb,
        nowArb,
        // days since expired: 0 to 13 (within grace)
        fc.integer({ min: 0, max: 13 }),
        async (alias, now, daysSinceExpired) => {
          const expiredAt = new Date(
            now.getTime() - daysSinceExpired * 24 * 60 * 60 * 1000,
          );
          const record = makeRecord({
            alias,
            expires_at: new Date(expiredAt.getTime() - 86400_000).toISOString(),
            expiry_status: "expired",
            expired_at: expiredAt.toISOString(),
            expiry_policy_type: "fixed",
          });

          const { deps, deleted, updated } = makeDeps();
          await processExpiryRecords([record], now, deps);

          expect(deleted).toHaveLength(0);
          expect(updated).toHaveLength(0);
        },
      ),
      { numRuns: 100 },
    );
  });

  it("active records with expires_at far in the future are not transitioned", async () => {
    await fc.assert(
      fc.asyncProperty(
        aliasArb,
        nowArb,
        // days until expiry: > 30
        fc.integer({ min: 31, max: 365 }),
        async (alias, now, daysUntil) => {
          const expiresAt = new Date(
            now.getTime() + daysUntil * 24 * 60 * 60 * 1000,
          );
          const record = makeRecord({
            alias,
            expires_at: expiresAt.toISOString(),
            expiry_status: "active",
            expiry_policy_type: "fixed",
          });

          const { deps, updated, deleted } = makeDeps();
          await processExpiryRecords([record], now, deps);

          expect(updated).toHaveLength(0);
          expect(deleted).toHaveLength(0);
        },
      ),
      { numRuns: 100 },
    );
  });

  it("never policy records are not included (pre-filtered by query)", () => {
    // The processor queries WHERE expiry_policy_type != 'never',
    // so 'never' records never reach processExpiryRecords.
    // This test verifies that if somehow a 'never' record is passed,
    // it is not transitioned (expires_at is null).
    fc.assert(
      fc.asyncProperty(aliasArb, nowArb, async (alias, now) => {
        const record = makeRecord({
          alias,
          expires_at: null,
          expiry_status: "no_expiry",
          expiry_policy_type: "never",
        });

        const { deps, updated, deleted } = makeDeps();
        await processExpiryRecords([record], now, deps);

        expect(updated).toHaveLength(0);
        expect(deleted).toHaveLength(0);
      }),
      { numRuns: 50 },
    );
  });
});

// Feature: go-url-alias-service, Property 21: Expiry processor summary matches actual transitions
describe("Property 21: Expiry processor summary matches actual transitions", () => {
  /**
   * Validates: Requirements 11.7
   *
   * When the expiry processor completes a run, the summary counts
   * (expiring_soon, expired, deleted, errors) should match the actual
   * number of transitions performed.
   */

  it("summary counts match actual transitions for mixed record sets", async () => {
    // Generate a mix of records in different states
    const recordSetArb = fc.tuple(
      nowArb,
      // Number of each type of record
      fc.integer({ min: 0, max: 5 }), // active within 30 days
      fc.integer({ min: 0, max: 5 }), // past expiry (not yet expired)
      fc.integer({ min: 0, max: 5 }), // expired past grace period
      fc.integer({ min: 0, max: 5 }), // expired within grace period (no-op)
      fc.integer({ min: 0, max: 5 }), // active far future (no-op)
    );

    await fc.assert(
      fc.asyncProperty(
        recordSetArb,
        async ([
          now,
          expiringSoonCount,
          expiredCount,
          deletedCount,
          graceCount,
          noopCount,
        ]) => {
          const records: AliasRecord[] = [];
          let idx = 0;

          // Active records within 30 days → should become expiring_soon
          for (let i = 0; i < expiringSoonCount; i++) {
            records.push(
              makeRecord({
                alias: `es-${idx++}`,
                expires_at: new Date(
                  now.getTime() + 3 * 24 * 60 * 60 * 1000,
                ).toISOString(),
                expiry_status: "active",
                expiry_policy_type: "fixed",
              }),
            );
          }

          // Past expiry, not yet expired → should become expired
          for (let i = 0; i < expiredCount; i++) {
            records.push(
              makeRecord({
                alias: `ex-${idx++}`,
                expires_at: new Date(
                  now.getTime() - 2 * 24 * 60 * 60 * 1000,
                ).toISOString(),
                expiry_status: "active",
                expiry_policy_type: "fixed",
              }),
            );
          }

          // Expired past 14-day grace → should be deleted
          for (let i = 0; i < deletedCount; i++) {
            records.push(
              makeRecord({
                alias: `del-${idx++}`,
                expires_at: new Date(
                  now.getTime() - 30 * 24 * 60 * 60 * 1000,
                ).toISOString(),
                expiry_status: "expired",
                expired_at: new Date(
                  now.getTime() - 20 * 24 * 60 * 60 * 1000,
                ).toISOString(),
                expiry_policy_type: "fixed",
              }),
            );
          }

          // Expired within grace period → no-op
          for (let i = 0; i < graceCount; i++) {
            records.push(
              makeRecord({
                alias: `grace-${idx++}`,
                expires_at: new Date(
                  now.getTime() - 5 * 24 * 60 * 60 * 1000,
                ).toISOString(),
                expiry_status: "expired",
                expired_at: new Date(
                  now.getTime() - 3 * 24 * 60 * 60 * 1000,
                ).toISOString(),
                expiry_policy_type: "fixed",
              }),
            );
          }

          // Active far future → no-op
          for (let i = 0; i < noopCount; i++) {
            records.push(
              makeRecord({
                alias: `noop-${idx++}`,
                expires_at: new Date(
                  now.getTime() + 60 * 24 * 60 * 60 * 1000,
                ).toISOString(),
                expiry_status: "active",
                expiry_policy_type: "fixed",
              }),
            );
          }

          const { deps, updated, deleted } = makeDeps();
          const result = await processExpiryRecords(records, now, deps);

          // Summary counts should match actual operations
          expect(result.transitioned_to_expiring_soon).toBe(expiringSoonCount);
          expect(result.transitioned_to_expired).toBe(expiredCount);
          expect(result.permanently_deleted).toBe(deletedCount);
          expect(result.errors).toBe(0);

          // Cross-check with actual tracked operations
          const actualExpiringSoon = updated.filter(
            (r) => r.expiry_status === "expiring_soon",
          ).length;
          const actualExpired = updated.filter(
            (r) => r.expiry_status === "expired",
          ).length;

          expect(result.transitioned_to_expiring_soon).toBe(actualExpiringSoon);
          expect(result.transitioned_to_expired).toBe(actualExpired);
          expect(result.permanently_deleted).toBe(deleted.length);
        },
      ),
      { numRuns: 100 },
    );
  });

  it("errors are counted and processing continues", async () => {
    await fc.assert(
      fc.asyncProperty(
        nowArb,
        fc.integer({ min: 1, max: 5 }),
        async (now, errorCount) => {
          const records: AliasRecord[] = [];

          // Create records that will trigger updates but the update will fail
          for (let i = 0; i < errorCount; i++) {
            records.push(
              makeRecord({
                alias: `err-${i}`,
                expires_at: new Date(now.getTime() - 86400_000).toISOString(),
                expiry_status: "active",
                expiry_policy_type: "fixed",
              }),
            );
          }

          // Add one good record that should succeed
          records.push(
            makeRecord({
              alias: "good",
              expires_at: new Date(
                now.getTime() + 31 * 24 * 60 * 60 * 1000,
              ).toISOString(),
              expiry_status: "active",
              expiry_policy_type: "fixed",
            }),
          );

          let callCount = 0;
          const deps = {
            updateAlias: async (record: AliasRecord) => {
              callCount++;
              // Fail for the first errorCount calls
              if (callCount <= errorCount) {
                throw new Error("Simulated DB error");
              }
              return record;
            },
            deleteAlias: async () => {},
          };

          const result = await processExpiryRecords(records, now, deps);

          expect(result.errors).toBe(errorCount);
          expect(result.transitioned_to_expiring_soon).toBe(0);
        },
      ),
      { numRuns: 50 },
    );
  });
});
