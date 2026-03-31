/**
 * Property tests for the redirect Azure Function handler.
 *
 * Property 1: Alias resolution follows private-first precedence
 * Property 3: Successful redirect increments analytics
 * Property 4: Expired aliases block redirection
 * Property 5: Inactivity expiry resets on access
 */

import type { HttpRequest, InvocationContext } from "@azure/functions";
import fc from "fast-check";
import { beforeEach, describe, expect, it, vi } from "vitest";
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

vi.mock("../../src/shared/auth-provider.js", () => ({
  createAuthProvider: vi.fn(),
}));

import { redirectHandler } from "../../src/functions/redirect.js";
import { createAuthProvider } from "../../src/shared/auth-provider.js";
import {
  getAliasByPartition,
  updateAlias,
} from "../../src/shared/cosmos-client.js";

const mockGetAlias = vi.mocked(getAliasByPartition);
const mockUpdateAlias = vi.mocked(updateAlias);
const mockCreateAuthProvider = vi.mocked(createAuthProvider);

// ---------------------------------------------------------------------------
// Generators
// ---------------------------------------------------------------------------

/** Valid lowercase alias names */
const aliasArb = fc
  .stringOf(fc.constantFrom(..."abcdefghijklmnopqrstuvwxyz0123456789-"), {
    minLength: 1,
    maxLength: 30,
  })
  .filter((s) => /^[a-z0-9-]+$/.test(s));

/** Email-like strings */
const emailArb = fc
  .tuple(
    fc.stringOf(fc.constantFrom(..."abcdefghijklmnopqrstuvwxyz0123456789"), {
      minLength: 1,
      maxLength: 12,
    }),
    fc.constantFrom("example.com", "test.org", "corp.net"),
  )
  .map(([user, domain]) => `${user}@${domain}`);

/** Valid destination URLs */
const destinationUrlArb = fc
  .tuple(
    fc.constantFrom("https://", "http://"),
    fc.constantFrom("example.com", "docs.internal.net", "wiki.corp.com"),
    fc.constantFrom("", "/page", "/docs/guide", "/a/b/c"),
  )
  .map(([proto, host, path]) => `${proto}${host}${path}`);

/** Non-negative click count */
const clickCountArb = fc.integer({ min: 0, max: 100_000 });

/** Non-negative heat score */
const heatScoreArb = fc.double({ min: 0, max: 1_000_000, noNaN: true });

/** A reasonable base date (2024–2030) */
const baseDateArb = fc
  .integer({ min: 1704067200000, max: 1893456000000 })
  .map((ms) => new Date(ms));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRequest(alias: string, opts?: { query?: string }): HttpRequest {
  const url = `https://go.example.com/${alias}${opts?.query ?? ""}`;
  const headers = new Headers({
    "x-mock-user-email": "testuser@example.com",
    "x-mock-user-roles": "User",
  });
  return {
    url,
    params: { alias },
    headers,
    method: "GET",
  } as unknown as HttpRequest;
}

function makeContext(): InvocationContext {
  return {
    error: vi.fn(),
    warn: vi.fn(),
    log: vi.fn(),
  } as unknown as InvocationContext;
}

function makeAlias(overrides: Partial<AliasRecord>): AliasRecord {
  return {
    id: overrides.id ?? "test",
    alias: overrides.alias ?? "test",
    destination_url: overrides.destination_url ?? "https://example.com/dest",
    created_by: overrides.created_by ?? "testuser@example.com",
    title: "Test Alias",
    click_count: overrides.click_count ?? 5,
    heat_score: overrides.heat_score ?? 2.0,
    heat_updated_at:
      overrides.heat_updated_at ??
      new Date(Date.now() - 3600_000).toISOString(),
    is_private: overrides.is_private ?? false,
    created_at: new Date(Date.now() - 86400_000 * 30).toISOString(),
    last_accessed_at: overrides.last_accessed_at ?? null,
    expiry_policy_type: overrides.expiry_policy_type ?? "fixed",
    duration_months: overrides.duration_months ?? 12,
    custom_expires_at: overrides.custom_expires_at ?? null,
    expires_at:
      overrides.expires_at ??
      new Date(Date.now() + 86400_000 * 300).toISOString(),
    expiry_status: overrides.expiry_status ?? "active",
    expired_at: overrides.expired_at ?? null,
  };
}

/**
 * Configure mock auth to return the given email.
 * Also sets up mockGetAlias to return undefined by default and
 * mockUpdateAlias to resolve.
 */
function resetMocks(email: string): void {
  vi.clearAllMocks();
  mockCreateAuthProvider.mockReturnValue({
    extractIdentity: () => ({ email, roles: ["User"] }),
  });
  mockUpdateAlias.mockResolvedValue(undefined as any);
  mockGetAlias.mockResolvedValue(undefined);
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  resetMocks("testuser@example.com");
});

// Feature: go-url-alias-service, Property 1: Alias resolution follows private-first precedence
describe("Property 1: Alias resolution follows private-first precedence", () => {
  /**
   * Validates: Requirements 1.4, 1.5, 1.6, 1.7, 7.1, 7.2
   *
   * For any authenticated user and any alias name, the redirection engine should:
   * - Return the private alias destination if only a private alias exists
   * - Return the global alias destination if only a global alias exists
   * - Show the interstitial page if both exist
   * - Redirect to dashboard with create suggestion if neither exists
   * - Treat another user's private alias as non-existent
   */

  it("returns 302 to private destination when only private alias exists", async () => {
    await fc.assert(
      fc.asyncProperty(
        aliasArb,
        emailArb,
        destinationUrlArb,
        async (alias, email, destUrl) => {
          resetMocks(email);

          const priv = makeAlias({
            id: `${alias}:${email}`,
            alias,
            is_private: true,
            destination_url: destUrl,
            created_by: email,
          });

          mockGetAlias.mockImplementation(async (_a, id) => {
            if (id === `${alias}:${email}`) return priv;
            return undefined;
          });

          const res = await redirectHandler(makeRequest(alias), makeContext());
          expect(res.status).toBe(302);
          const loc = (res.headers as Record<string, string>).location;
          expect(loc).toContain(new URL(destUrl).hostname);
        },
      ),
      { numRuns: 50 },
    );
  });

  it("returns 302 to global destination when only global alias exists", async () => {
    await fc.assert(
      fc.asyncProperty(
        aliasArb,
        emailArb,
        destinationUrlArb,
        async (alias, email, destUrl) => {
          resetMocks(email);

          const global = makeAlias({
            id: alias,
            alias,
            is_private: false,
            destination_url: destUrl,
          });

          mockGetAlias.mockImplementation(async (_a, id) => {
            if (id === alias) return global;
            return undefined;
          });

          const res = await redirectHandler(makeRequest(alias), makeContext());
          expect(res.status).toBe(302);
          const loc = (res.headers as Record<string, string>).location;
          expect(loc).toContain(new URL(destUrl).hostname);
        },
      ),
      { numRuns: 50 },
    );
  });

  it("returns 302 redirect to interstitial route when both private and global exist", async () => {
    await fc.assert(
      fc.asyncProperty(
        aliasArb,
        emailArb,
        destinationUrlArb,
        destinationUrlArb,
        async (alias, email, privUrl, globalUrl) => {
          resetMocks(email);

          const priv = makeAlias({
            id: `${alias}:${email}`,
            alias,
            is_private: true,
            destination_url: privUrl,
            created_by: email,
          });
          const global = makeAlias({
            id: alias,
            alias,
            is_private: false,
            destination_url: globalUrl,
          });

          mockGetAlias.mockImplementation(async (_a, id) => {
            if (id === `${alias}:${email}`) return priv;
            if (id === alias) return global;
            return undefined;
          });

          const res = await redirectHandler(makeRequest(alias), makeContext());
          expect(res.status).toBe(302);
          const location = (res.headers as Record<string, string>).location;
          expect(location).toContain("/interstitial");
          expect(location).toContain("alias=");
          expect(location).toContain("privateUrl=");
          expect(location).toContain("globalUrl=");
        },
      ),
      { numRuns: 50 },
    );
  });

  it("redirects to dashboard with suggest param when neither exists", async () => {
    await fc.assert(
      fc.asyncProperty(aliasArb, emailArb, async (alias, email) => {
        resetMocks(email);
        // mockGetAlias already defaults to undefined

        const res = await redirectHandler(makeRequest(alias), makeContext());
        expect(res.status).toBe(302);
        const loc = (res.headers as Record<string, string>).location;
        expect(loc).toContain(`suggest=${encodeURIComponent(alias)}`);
      }),
      { numRuns: 50 },
    );
  });

  it("treats another user's private alias as non-existent", async () => {
    await fc.assert(
      fc.asyncProperty(
        aliasArb,
        emailArb,
        emailArb,
        async (alias, requestingUser, otherUser) => {
          fc.pre(requestingUser !== otherUser);
          resetMocks(requestingUser);
          // Handler queries for ${alias}:${requestingUser} and ${alias}
          // Neither matches since the alias belongs to otherUser

          const res = await redirectHandler(makeRequest(alias), makeContext());
          expect(res.status).toBe(302);
          const loc = (res.headers as Record<string, string>).location;
          expect(loc).toContain("suggest=");
        },
      ),
      { numRuns: 50 },
    );
  });
});

// Feature: go-url-alias-service, Property 3: Successful redirect increments analytics
describe("Property 3: Successful redirect increments analytics", () => {
  /**
   * Validates: Requirements 1.8, 1.9, 1.10, 6.1, 6.2, 6.3, 15.2, 15.5
   *
   * For any alias that is successfully redirected, the click_count should
   * increase by exactly 1, last_accessed_at should be updated, and heat_score
   * should be updated by applying exponential decay plus 1.0.
   */

  it("click_count increments by exactly 1 on successful redirect", async () => {
    await fc.assert(
      fc.asyncProperty(
        aliasArb,
        clickCountArb,
        async (alias, initialClicks) => {
          resetMocks("testuser@example.com");

          const record = makeAlias({
            id: alias,
            alias,
            click_count: initialClicks,
          });

          mockGetAlias.mockImplementation(async (_a, id) => {
            if (id === alias) return record;
            return undefined;
          });

          await redirectHandler(makeRequest(alias), makeContext());
          expect(mockUpdateAlias).toHaveBeenCalledTimes(1);
          const updated = mockUpdateAlias.mock.calls[0][0];
          expect(updated.click_count).toBe(initialClicks + 1);
        },
      ),
      { numRuns: 100 },
    );
  });

  it("last_accessed_at is updated to a recent timestamp on redirect", async () => {
    await fc.assert(
      fc.asyncProperty(aliasArb, async (alias) => {
        resetMocks("testuser@example.com");

        const record = makeAlias({
          id: alias,
          alias,
          last_accessed_at: null,
        });

        mockGetAlias.mockImplementation(async (_a, id) => {
          if (id === alias) return record;
          return undefined;
        });

        const before = Date.now();
        await redirectHandler(makeRequest(alias), makeContext());

        expect(mockUpdateAlias).toHaveBeenCalledTimes(1);
        const updated = mockUpdateAlias.mock.calls[0][0];
        expect(updated.last_accessed_at).toBeTruthy();
        const ts = new Date(updated.last_accessed_at!).getTime();
        expect(ts).toBeGreaterThanOrEqual(before - 1000);
        expect(ts).toBeLessThanOrEqual(Date.now() + 1000);
      }),
      { numRuns: 50 },
    );
  });

  it("heat_score is updated with decay + 1.0 increment on redirect", async () => {
    await fc.assert(
      fc.asyncProperty(
        aliasArb,
        heatScoreArb,
        baseDateArb,
        async (alias, initialHeat, heatUpdatedDate) => {
          resetMocks("testuser@example.com");

          const record = makeAlias({
            id: alias,
            alias,
            heat_score: initialHeat,
            heat_updated_at: heatUpdatedDate.toISOString(),
          });

          mockGetAlias.mockImplementation(async (_a, id) => {
            if (id === alias) return record;
            return undefined;
          });

          await redirectHandler(makeRequest(alias), makeContext());
          expect(mockUpdateAlias).toHaveBeenCalledTimes(1);
          const updated = mockUpdateAlias.mock.calls[0][0];
          // Heat score should always be >= 1.0 (at minimum the increment)
          expect(updated.heat_score).toBeGreaterThanOrEqual(1.0);
          expect(updated.heat_updated_at).toBeTruthy();
        },
      ),
      { numRuns: 100 },
    );
  });

  it("heat_score equals 1.0 when heat_updated_at was null (first access)", async () => {
    await fc.assert(
      fc.asyncProperty(aliasArb, async (alias) => {
        resetMocks("testuser@example.com");

        const record = makeAlias({
          id: alias,
          alias,
          heat_score: 0,
          heat_updated_at: null,
        });

        mockGetAlias.mockImplementation(async (_a, id) => {
          if (id === alias) return record;
          return undefined;
        });

        await redirectHandler(makeRequest(alias), makeContext());
        expect(mockUpdateAlias).toHaveBeenCalledTimes(1);
        const updated = mockUpdateAlias.mock.calls[0][0];
        expect(updated.heat_score).toBe(1.0);
      }),
      { numRuns: 50 },
    );
  });
});

// Feature: go-url-alias-service, Property 4: Expired aliases block redirection
describe("Property 4: Expired aliases block redirection", () => {
  /**
   * Validates: Requirements 1.10, 10.3
   *
   * For any alias record with expiry_status set to 'expired', the redirection
   * engine should never perform a redirect to the destination URL. It should
   * redirect to the dashboard with an expired indicator instead.
   */

  it("expired global alias never redirects to destination", async () => {
    await fc.assert(
      fc.asyncProperty(aliasArb, destinationUrlArb, async (alias, destUrl) => {
        resetMocks("testuser@example.com");

        const expired = makeAlias({
          id: alias,
          alias,
          destination_url: destUrl,
          expiry_status: "expired",
          expired_at: new Date(Date.now() - 86400_000).toISOString(),
        });

        mockGetAlias.mockImplementation(async (_a, id) => {
          if (id === alias) return expired;
          return undefined;
        });

        const res = await redirectHandler(makeRequest(alias), makeContext());
        // Should redirect to dashboard with expired param, not to destination
        expect(res.status).toBe(302);
        const loc = (res.headers as Record<string, string>).location;
        expect(loc).toContain("expired=");
        expect(loc).not.toContain(new URL(destUrl).hostname);
        // Analytics should NOT be updated for expired aliases
        expect(mockUpdateAlias).not.toHaveBeenCalled();
      }),
      { numRuns: 50 },
    );
  });

  it("expired private alias never redirects to destination", async () => {
    await fc.assert(
      fc.asyncProperty(
        aliasArb,
        emailArb,
        destinationUrlArb,
        async (alias, email, destUrl) => {
          resetMocks(email);

          const expired = makeAlias({
            id: `${alias}:${email}`,
            alias,
            is_private: true,
            destination_url: destUrl,
            created_by: email,
            expiry_status: "expired",
            expired_at: new Date(Date.now() - 86400_000).toISOString(),
          });

          mockGetAlias.mockImplementation(async (_a, id) => {
            if (id === `${alias}:${email}`) return expired;
            return undefined;
          });

          const res = await redirectHandler(makeRequest(alias), makeContext());
          expect(res.status).toBe(302);
          const loc = (res.headers as Record<string, string>).location;
          expect(loc).toContain("expired=");
          expect(loc).not.toContain(new URL(destUrl).hostname);
          expect(mockUpdateAlias).not.toHaveBeenCalled();
        },
      ),
      { numRuns: 50 },
    );
  });

  it("when both private and global are expired, redirects to dashboard", async () => {
    await fc.assert(
      fc.asyncProperty(
        aliasArb,
        emailArb,
        destinationUrlArb,
        destinationUrlArb,
        async (alias, email, privUrl, globalUrl) => {
          resetMocks(email);

          const priv = makeAlias({
            id: `${alias}:${email}`,
            alias,
            is_private: true,
            destination_url: privUrl,
            created_by: email,
            expiry_status: "expired",
            expired_at: new Date(Date.now() - 86400_000).toISOString(),
          });
          const global = makeAlias({
            id: alias,
            alias,
            is_private: false,
            destination_url: globalUrl,
            expiry_status: "expired",
            expired_at: new Date(Date.now() - 86400_000).toISOString(),
          });

          mockGetAlias.mockImplementation(async (_a, id) => {
            if (id === `${alias}:${email}`) return priv;
            if (id === alias) return global;
            return undefined;
          });

          const res = await redirectHandler(makeRequest(alias), makeContext());
          const loc = (res.headers as Record<string, string>).location;
          expect(loc).toContain("expired=");
          expect(mockUpdateAlias).not.toHaveBeenCalled();
        },
      ),
      { numRuns: 50 },
    );
  });
});

// Feature: go-url-alias-service, Property 5: Inactivity expiry resets on access
describe("Property 5: Inactivity expiry resets on access", () => {
  /**
   * Validates: Requirements 9.7
   *
   * For any alias record with expiry_policy_type set to 'inactivity',
   * when the alias is accessed via the redirection engine, the expires_at
   * timestamp should be recalculated to 12 months from the current UTC time.
   */

  it("expires_at is reset to ~12 months from now on inactivity alias access", async () => {
    await fc.assert(
      fc.asyncProperty(
        aliasArb,
        fc
          .integer({ min: 1, max: 300 })
          .map((days) => new Date(Date.now() + 86400_000 * days).toISOString()),
        async (alias, initialExpiresAt) => {
          resetMocks("testuser@example.com");

          const record = makeAlias({
            id: alias,
            alias,
            expiry_policy_type: "inactivity",
            expires_at: initialExpiresAt,
            expiry_status: "active",
          });

          mockGetAlias.mockImplementation(async (_a, id) => {
            if (id === alias) return record;
            return undefined;
          });

          const beforeCall = Date.now();
          await redirectHandler(makeRequest(alias), makeContext());

          expect(mockUpdateAlias).toHaveBeenCalledTimes(1);
          const updated = mockUpdateAlias.mock.calls[0][0];
          const newExpiry = new Date(updated.expires_at!).getTime();

          // 12 months ≈ 365 days. Allow a window for test timing.
          const elevenMonthsMs = 86400_000 * 330;
          const thirteenMonthsMs = 86400_000 * 400;

          expect(newExpiry).toBeGreaterThanOrEqual(beforeCall + elevenMonthsMs);
          expect(newExpiry).toBeLessThanOrEqual(Date.now() + thirteenMonthsMs);
        },
      ),
      { numRuns: 50 },
    );
  });

  it("non-inactivity policies do NOT reset expires_at on access", async () => {
    await fc.assert(
      fc.asyncProperty(
        aliasArb,
        fc.constantFrom("fixed" as const, "never" as const),
        async (alias, policyType) => {
          resetMocks("testuser@example.com");

          const isNever = policyType === "never";
          const originalExpiresAt = isNever
            ? null
            : new Date(Date.now() + 86400_000 * 100).toISOString();

          const record = makeAlias({
            id: alias,
            alias,
            expiry_policy_type: policyType,
            expiry_status: isNever ? "no_expiry" : "active",
          });
          // Explicitly set expires_at after construction to handle null
          record.expires_at = originalExpiresAt;

          mockGetAlias.mockImplementation(async (_a, id) => {
            if (id === alias) return record;
            return undefined;
          });

          await redirectHandler(makeRequest(alias), makeContext());

          if (mockUpdateAlias.mock.calls.length > 0) {
            const updated = mockUpdateAlias.mock.calls[0][0];
            expect(updated.expires_at).toBe(originalExpiresAt);
          }
        },
      ),
      { numRuns: 50 },
    );
  });
});
