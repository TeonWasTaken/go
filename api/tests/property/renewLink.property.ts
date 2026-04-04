/**
 * Property tests for the PUT /api/links/:alias/renew Azure Function handler.
 *
 * Property 19: Renewal resets alias to active state
 * Validates: Requirements 2.16, 10.4, 10.6
 */

import type { HttpRequest, InvocationContext } from "@azure/functions";
import fc from "fast-check";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthStrategy } from "../../src/shared/auth-strategy.js";
import type { AliasRecord } from "../../src/shared/models.js";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock("@azure/functions", () => ({
  app: { http: vi.fn() },
}));

vi.mock("../../src/shared/cosmos-client.js", () => ({
  getAliasByPartition: vi.fn(),
  updateAlias: vi.fn(),
}));

import { createRenewLinkHandler } from "../../src/functions/renewLink.js";
import {
    getAliasByPartition,
    updateAlias,
} from "../../src/shared/cosmos-client.js";

const mockGetAlias = vi.mocked(getAliasByPartition);
const mockUpdateAlias = vi.mocked(updateAlias);

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
      maxLength: 12,
    }),
    fc.constantFrom("example.com", "test.org", "corp.net"),
  )
  .map(([user, domain]) => `${user}@${domain}`);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeMockStrategy(
  email: string = "alice@example.com",
  roles: string[] = ["User"],
): AuthStrategy {
  return {
    mode: "dev",
    redirectRequiresAuth: false,
    identityProviders: ["dev"],
    extractIdentity: (headers: Record<string, string>) => ({
      email: headers["x-mock-user-email"] || email,
      roles: (headers["x-mock-user-roles"] || roles.join(","))
        .split(",")
        .map((s: string) => s.trim()),
    }),
  };
}

function makeRequest(
  alias: string,
  email: string = "alice@example.com",
  roles: string = "User",
): HttpRequest {
  const headers = new Headers({
    "x-mock-user-email": email,
    "x-mock-user-roles": roles,
  });
  return {
    url: `https://go.example.com/api/links/${alias}/renew`,
    headers,
    method: "PUT",
    params: { alias },
  } as unknown as HttpRequest;
}

function makeContext(): InvocationContext {
  return {
    error: vi.fn(),
    warn: vi.fn(),
    log: vi.fn(),
  } as unknown as InvocationContext;
}

function makeAlias(overrides: Partial<AliasRecord> = {}): AliasRecord {
  return {
    id: "test-link",
    alias: "test-link",
    destination_url: "https://example.com/page",
    created_by: "alice@example.com",
    title: "Test Link",
    click_count: 5,
    heat_score: 2.0,
    heat_updated_at: new Date().toISOString(),
    is_private: false,
    created_at: new Date().toISOString(),
    last_accessed_at: null,
    expiry_policy_type: "fixed",
    duration_months: 12,
    custom_expires_at: null,
    expires_at: new Date(Date.now() - 86400_000).toISOString(),
    expiry_status: "expired",
    expired_at: new Date(Date.now() - 86400_000).toISOString(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
  mockUpdateAlias.mockImplementation(async (record) => record);
});

// ---------------------------------------------------------------------------
// Property 19: Renewal resets alias to active state
// ---------------------------------------------------------------------------

describe("Property 19: Renewal resets alias to active state", () => {
  /**
   * Validates: Requirements 2.16, 10.4, 10.6
   *
   * For any expired alias record within the 14-day grace period, when renewed
   * by the owner or an Admin, the expiry_status should be set to active,
   * expires_at should be recalculated based on the current expiry policy,
   * and expired_at should be cleared to null.
   */

  it("creator renewing own expired alias with fixed policy resets status to active and recalculates expires_at", async () => {
    await fc.assert(
      fc.asyncProperty(
        aliasArb,
        emailArb,
        fc.constantFrom<1 | 3 | 12>(1, 3, 12),
        async (alias, creatorEmail, durationMonths) => {
          vi.clearAllMocks();
          const strategy = makeMockStrategy(creatorEmail, ["User"]);
          mockUpdateAlias.mockImplementation(async (record) => record);

          const existing = makeAlias({
            id: alias,
            alias,
            created_by: creatorEmail,
            is_private: false,
            expiry_policy_type: "fixed",
            duration_months: durationMonths,
            expiry_status: "expired",
            expired_at: new Date(Date.now() - 86400_000).toISOString(),
            expires_at: new Date(Date.now() - 86400_000 * 2).toISOString(),
          });

          mockGetAlias.mockImplementation(async (_a, id) => {
            if (id === `${alias}:${creatorEmail}`) return undefined;
            if (id === alias) return existing;
            return undefined;
          });

          const handler = createRenewLinkHandler(strategy);
          const beforeRenew = Date.now();
          const res = await handler(
            makeRequest(alias, creatorEmail),
            makeContext(),
          );
          const afterRenew = Date.now();

          expect(res.status).toBe(200);
          const body: AliasRecord = JSON.parse(res.body as string);
          // With the fix, short durations (e.g. 1 month) may be within 30-day threshold
          expect(["active", "expiring_soon"]).toContain(body.expiry_status);
          expect(body.expired_at).toBeNull();
          expect(body.expires_at).not.toBeNull();

          // Verify expires_at is approximately now + durationMonths
          const expiresAt = new Date(body.expires_at!).getTime();
          const expectedMin = new Date(beforeRenew);
          expectedMin.setUTCMonth(expectedMin.getUTCMonth() + durationMonths);
          const expectedMax = new Date(afterRenew);
          expectedMax.setUTCMonth(expectedMax.getUTCMonth() + durationMonths);

          expect(expiresAt).toBeGreaterThanOrEqual(
            expectedMin.getTime() - 1000,
          );
          expect(expiresAt).toBeLessThanOrEqual(expectedMax.getTime() + 1000);
        },
      ),
      { numRuns: 50 },
    );
  });

  it("admin renewing any global expired alias resets status to active and recalculates expires_at", async () => {
    await fc.assert(
      fc.asyncProperty(
        aliasArb,
        emailArb,
        emailArb,
        fc.constantFrom<1 | 3 | 12>(1, 3, 12),
        async (alias, creatorEmail, adminEmail, durationMonths) => {
          fc.pre(creatorEmail !== adminEmail);

          vi.clearAllMocks();
          const strategy = makeMockStrategy(adminEmail, ["Admin"]);
          mockUpdateAlias.mockImplementation(async (record) => record);

          const existing = makeAlias({
            id: alias,
            alias,
            created_by: creatorEmail,
            is_private: false,
            expiry_policy_type: "fixed",
            duration_months: durationMonths,
            expiry_status: "expired",
            expired_at: new Date(Date.now() - 86400_000).toISOString(),
            expires_at: new Date(Date.now() - 86400_000 * 2).toISOString(),
          });

          mockGetAlias.mockImplementation(async (_a, id) => {
            if (id === `${alias}:${adminEmail}`) return undefined;
            if (id === alias) return existing;
            return undefined;
          });

          const handler = createRenewLinkHandler(strategy);
          const beforeRenew = Date.now();
          const res = await handler(
            makeRequest(alias, adminEmail, "Admin"),
            makeContext(),
          );
          const afterRenew = Date.now();

          expect(res.status).toBe(200);
          const body: AliasRecord = JSON.parse(res.body as string);
          // With the fix, short durations (e.g. 1 month) may be within 30-day threshold
          expect(["active", "expiring_soon"]).toContain(body.expiry_status);
          expect(body.expired_at).toBeNull();
          expect(body.expires_at).not.toBeNull();

          // Verify expires_at is approximately now + durationMonths
          const expiresAt = new Date(body.expires_at!).getTime();
          const expectedMin = new Date(beforeRenew);
          expectedMin.setUTCMonth(expectedMin.getUTCMonth() + durationMonths);
          const expectedMax = new Date(afterRenew);
          expectedMax.setUTCMonth(expectedMax.getUTCMonth() + durationMonths);

          expect(expiresAt).toBeGreaterThanOrEqual(
            expectedMin.getTime() - 1000,
          );
          expect(expiresAt).toBeLessThanOrEqual(expectedMax.getTime() + 1000);
        },
      ),
      { numRuns: 50 },
    );
  });

  it("renewal with inactivity policy sets expires_at to ~12 months from now", async () => {
    await fc.assert(
      fc.asyncProperty(aliasArb, emailArb, async (alias, creatorEmail) => {
        vi.clearAllMocks();
        const strategy = makeMockStrategy(creatorEmail, ["User"]);
        mockUpdateAlias.mockImplementation(async (record) => record);

        const existing = makeAlias({
          id: alias,
          alias,
          created_by: creatorEmail,
          is_private: false,
          expiry_policy_type: "inactivity",
          duration_months: null,
          expiry_status: "expired",
          expired_at: new Date(Date.now() - 86400_000).toISOString(),
          expires_at: new Date(Date.now() - 86400_000 * 2).toISOString(),
        });

        mockGetAlias.mockImplementation(async (_a, id) => {
          if (id === `${alias}:${creatorEmail}`) return undefined;
          if (id === alias) return existing;
          return undefined;
        });

        const handler = createRenewLinkHandler(strategy);
        const beforeRenew = Date.now();
        const res = await handler(
          makeRequest(alias, creatorEmail),
          makeContext(),
        );
        const afterRenew = Date.now();

        expect(res.status).toBe(200);
        const body: AliasRecord = JSON.parse(res.body as string);
        expect(body.expiry_status).toBe("active");
        expect(body.expired_at).toBeNull();
        expect(body.expires_at).not.toBeNull();

        // Verify expires_at is approximately now + 12 months
        const expiresAt = new Date(body.expires_at!).getTime();
        const expectedMin = new Date(beforeRenew);
        expectedMin.setUTCMonth(expectedMin.getUTCMonth() + 12);
        const expectedMax = new Date(afterRenew);
        expectedMax.setUTCMonth(expectedMax.getUTCMonth() + 12);

        expect(expiresAt).toBeGreaterThanOrEqual(expectedMin.getTime() - 1000);
        expect(expiresAt).toBeLessThanOrEqual(expectedMax.getTime() + 1000);
      }),
      { numRuns: 50 },
    );
  });

  it("renewal with never policy sets expiry_status to no_expiry and expires_at to null", async () => {
    await fc.assert(
      fc.asyncProperty(aliasArb, emailArb, async (alias, creatorEmail) => {
        vi.clearAllMocks();
        const strategy = makeMockStrategy(creatorEmail, ["User"]);
        mockUpdateAlias.mockImplementation(async (record) => record);

        const existing = makeAlias({
          id: alias,
          alias,
          created_by: creatorEmail,
          is_private: false,
          expiry_policy_type: "never",
          duration_months: null,
          expiry_status: "expired",
          expired_at: new Date(Date.now() - 86400_000).toISOString(),
          expires_at: null,
        });

        mockGetAlias.mockImplementation(async (_a, id) => {
          if (id === `${alias}:${creatorEmail}`) return undefined;
          if (id === alias) return existing;
          return undefined;
        });

        const handler = createRenewLinkHandler(strategy);
        const res = await handler(
          makeRequest(alias, creatorEmail),
          makeContext(),
        );

        expect(res.status).toBe(200);
        const body: AliasRecord = JSON.parse(res.body as string);
        expect(body.expiry_status).toBe("no_expiry");
        expect(body.expires_at).toBeNull();
        expect(body.expired_at).toBeNull();
      }),
      { numRuns: 50 },
    );
  });

  it("expired_at is always cleared after renewal regardless of policy type", async () => {
    await fc.assert(
      fc.asyncProperty(
        aliasArb,
        emailArb,
        fc.constantFrom<"never" | "fixed" | "inactivity">(
          "never",
          "fixed",
          "inactivity",
        ),
        async (alias, creatorEmail, policyType) => {
          vi.clearAllMocks();
          const strategy = makeMockStrategy(creatorEmail, ["User"]);
          mockUpdateAlias.mockImplementation(async (record) => record);

          const existing = makeAlias({
            id: alias,
            alias,
            created_by: creatorEmail,
            is_private: false,
            expiry_policy_type: policyType,
            duration_months: policyType === "fixed" ? 12 : null,
            expiry_status: "expired",
            expired_at: new Date(Date.now() - 86400_000).toISOString(),
            expires_at:
              policyType === "never"
                ? null
                : new Date(Date.now() - 86400_000 * 2).toISOString(),
          });

          mockGetAlias.mockImplementation(async (_a, id) => {
            if (id === `${alias}:${creatorEmail}`) return undefined;
            if (id === alias) return existing;
            return undefined;
          });

          const handler = createRenewLinkHandler(strategy);
          const res = await handler(
            makeRequest(alias, creatorEmail),
            makeContext(),
          );

          expect(res.status).toBe(200);
          const body: AliasRecord = JSON.parse(res.body as string);
          expect(body.expired_at).toBeNull();

          if (policyType === "never") {
            expect(body.expiry_status).toBe("no_expiry");
          } else {
            expect(body.expiry_status).toBe("active");
          }
        },
      ),
      { numRuns: 50 },
    );
  });
});
