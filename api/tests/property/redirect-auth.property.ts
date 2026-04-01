/**
 * Property tests for redirect endpoint auth-mode branching.
 *
 * Feature: multi-tenant-auth-modes, Property 7: Redirect endpoint enforces auth when strategy requires it
 * Feature: multi-tenant-auth-modes, Property 8: Unauthenticated redirect resolves only public aliases
 * Feature: multi-tenant-auth-modes, Property 9: Authenticated redirect in open mode resolves all aliases
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

import { createRedirectHandler } from "../../src/functions/redirect.js";
import {
  getAliasByPartition,
  updateAlias,
} from "../../src/shared/cosmos-client.js";

const mockGetAlias = vi.mocked(getAliasByPartition);
const mockUpdateAlias = vi.mocked(updateAlias);

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

/** Random header maps (none will produce a valid SWA identity) */
const headersArb = fc.dictionary(
  fc.stringOf(fc.constantFrom(..."abcdefghijklmnopqrstuvwxyz-"), {
    minLength: 1,
    maxLength: 20,
  }),
  fc.string({ minLength: 0, maxLength: 50 }),
  { minKeys: 0, maxKeys: 5 },
);

// ---------------------------------------------------------------------------
// Strategy factories
// ---------------------------------------------------------------------------

/** Strategy where redirectRequiresAuth=true and extractIdentity always returns null */
function makeAuthRequiredNullStrategy(): AuthStrategy {
  return {
    mode: "corporate",
    redirectRequiresAuth: true,
    identityProviders: ["aad"],
    extractIdentity: () => null,
  };
}

/** Strategy where redirectRequiresAuth=false and extractIdentity always returns null */
function makeOpenNullStrategy(): AuthStrategy {
  return {
    mode: "public",
    redirectRequiresAuth: false,
    identityProviders: ["google"],
    extractIdentity: () => null,
  };
}

/** Strategy where redirectRequiresAuth=false and extractIdentity returns a valid identity */
function makeOpenAuthenticatedStrategy(email: string): AuthStrategy {
  return {
    mode: "public",
    redirectRequiresAuth: false,
    identityProviders: ["google"],
    extractIdentity: () => ({ email, roles: ["User"] }),
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeContext(): InvocationContext {
  return {
    error: vi.fn(),
    warn: vi.fn(),
    log: vi.fn(),
  } as unknown as InvocationContext;
}

function makeRequest(
  alias: string,
  extraHeaders: Record<string, string> = {},
): HttpRequest {
  const headers = new Headers(extraHeaders);
  return {
    url: `https://go.example.com/${alias}`,
    params: { alias },
    headers,
    method: "GET",
  } as unknown as HttpRequest;
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
    icon_url: null,
  };
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
  mockUpdateAlias.mockResolvedValue(undefined as any);
  mockGetAlias.mockResolvedValue(undefined);
});

// ===========================================================================
// Feature: multi-tenant-auth-modes, Property 7: Redirect endpoint enforces auth when strategy requires it
// ===========================================================================
describe("Property 7: Redirect endpoint enforces auth when strategy requires it", () => {
  /**
   * **Validates: Requirements 3.7, 7.2**
   *
   * For any AuthStrategy where redirectRequiresAuth is true and for any
   * request that produces a null identity, the redirect handler returns HTTP 401.
   */

  it("returns 401 for any alias when strategy requires auth and identity is null", async () => {
    const strategy = makeAuthRequiredNullStrategy();
    const handler = createRedirectHandler(strategy);

    await fc.assert(
      fc.asyncProperty(aliasArb, headersArb, async (alias, extraHeaders) => {
        vi.clearAllMocks();
        const req = makeRequest(alias, extraHeaders);
        const res = await handler(req, makeContext());
        expect(res.status).toBe(401);
      }),
      { numRuns: 100 },
    );
  });
});

// ===========================================================================
// Feature: multi-tenant-auth-modes, Property 8: Unauthenticated redirect resolves only public aliases
// ===========================================================================
describe("Property 8: Unauthenticated redirect resolves only public aliases", () => {
  /**
   * **Validates: Requirements 4.5, 4.6, 7.3, 7.4**
   *
   * For any AuthStrategy where redirectRequiresAuth is false, and for any
   * unauthenticated request (null identity), and for any alias value:
   * - If a public (non-private) alias record exists → 302 redirect to destination
   * - If only a private alias record exists → treated as not found → 302 to /?suggest=...
   * - Private alias lookup is skipped entirely
   */

  it("resolves public (non-private) global alias with 302 redirect", async () => {
    const strategy = makeOpenNullStrategy();
    const handler = createRedirectHandler(strategy);

    await fc.assert(
      fc.asyncProperty(aliasArb, destinationUrlArb, async (alias, destUrl) => {
        vi.clearAllMocks();
        mockUpdateAlias.mockResolvedValue(undefined as any);

        const globalRecord = makeAlias({
          id: alias,
          alias,
          is_private: false,
          destination_url: destUrl,
        });

        mockGetAlias.mockImplementation(async (_a, id) => {
          if (id === alias) return globalRecord;
          return undefined;
        });

        const req = makeRequest(alias);
        const res = await handler(req, makeContext());
        expect(res.status).toBe(302);
        const loc = (res.headers as Record<string, string>).location;
        expect(loc).toContain(new URL(destUrl).hostname);
      }),
      { numRuns: 100 },
    );
  });

  it("treats private-only alias as not found and redirects to /?suggest=", async () => {
    const strategy = makeOpenNullStrategy();
    const handler = createRedirectHandler(strategy);

    await fc.assert(
      fc.asyncProperty(
        aliasArb,
        destinationUrlArb,
        emailArb,
        async (alias, destUrl, ownerEmail) => {
          vi.clearAllMocks();
          mockUpdateAlias.mockResolvedValue(undefined as any);

          // Global record exists but is_private=true
          const privateGlobal = makeAlias({
            id: alias,
            alias,
            is_private: true,
            destination_url: destUrl,
            created_by: ownerEmail,
          });

          mockGetAlias.mockImplementation(async (_a, id) => {
            if (id === alias) return privateGlobal;
            return undefined;
          });

          const req = makeRequest(alias);
          const res = await handler(req, makeContext());
          expect(res.status).toBe(302);
          const loc = (res.headers as Record<string, string>).location;
          expect(loc).toContain(`suggest=${encodeURIComponent(alias)}`);
        },
      ),
      { numRuns: 100 },
    );
  });

  it("does not call getAliasByPartition with private composite ID when identity is null", async () => {
    const strategy = makeOpenNullStrategy();
    const handler = createRedirectHandler(strategy);

    await fc.assert(
      fc.asyncProperty(aliasArb, async (alias) => {
        vi.clearAllMocks();
        mockUpdateAlias.mockResolvedValue(undefined as any);
        mockGetAlias.mockResolvedValue(undefined);

        const req = makeRequest(alias);
        await handler(req, makeContext());

        // Verify no call was made with a composite "alias:email" partition key
        for (const call of mockGetAlias.mock.calls) {
          const partitionId = call[1] as string;
          expect(partitionId).not.toContain(":");
        }
      }),
      { numRuns: 100 },
    );
  });
});

// ===========================================================================
// Feature: multi-tenant-auth-modes, Property 9: Authenticated redirect in open mode resolves all aliases
// ===========================================================================
describe("Property 9: Authenticated redirect in open mode resolves all aliases", () => {
  /**
   * **Validates: Requirements 7.5**
   *
   * For any AuthStrategy where redirectRequiresAuth is false, and for any
   * authenticated request (non-null identity), and for any alias value:
   * the redirect handler resolves both private and public aliases using the
   * same logic as the fully-authenticated corporate mode.
   */

  it("resolves private alias when only private exists (authenticated open mode)", async () => {
    await fc.assert(
      fc.asyncProperty(
        aliasArb,
        emailArb,
        destinationUrlArb,
        async (alias, email, destUrl) => {
          vi.clearAllMocks();
          mockUpdateAlias.mockResolvedValue(undefined as any);

          const strategy = makeOpenAuthenticatedStrategy(email);
          const handler = createRedirectHandler(strategy);

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

          const req = makeRequest(alias);
          const res = await handler(req, makeContext());
          expect(res.status).toBe(302);
          const loc = (res.headers as Record<string, string>).location;
          expect(loc).toContain(new URL(destUrl).hostname);
        },
      ),
      { numRuns: 100 },
    );
  });

  it("resolves global alias when only global exists (authenticated open mode)", async () => {
    await fc.assert(
      fc.asyncProperty(
        aliasArb,
        emailArb,
        destinationUrlArb,
        async (alias, email, destUrl) => {
          vi.clearAllMocks();
          mockUpdateAlias.mockResolvedValue(undefined as any);

          const strategy = makeOpenAuthenticatedStrategy(email);
          const handler = createRedirectHandler(strategy);

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

          const req = makeRequest(alias);
          const res = await handler(req, makeContext());
          expect(res.status).toBe(302);
          const loc = (res.headers as Record<string, string>).location;
          expect(loc).toContain(new URL(destUrl).hostname);
        },
      ),
      { numRuns: 100 },
    );
  });

  it("shows interstitial when both private and global exist (authenticated open mode)", async () => {
    await fc.assert(
      fc.asyncProperty(
        aliasArb,
        emailArb,
        destinationUrlArb,
        destinationUrlArb,
        async (alias, email, privUrl, globalUrl) => {
          vi.clearAllMocks();
          mockUpdateAlias.mockResolvedValue(undefined as any);

          const strategy = makeOpenAuthenticatedStrategy(email);
          const handler = createRedirectHandler(strategy);

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

          const req = makeRequest(alias);
          const res = await handler(req, makeContext());
          expect(res.status).toBe(302);
          const loc = (res.headers as Record<string, string>).location;
          expect(loc).toContain("/interstitial");
          expect(loc).toContain("alias=");
          expect(loc).toContain("privateUrl=");
          expect(loc).toContain("globalUrl=");
        },
      ),
      { numRuns: 100 },
    );
  });

  it("redirects to /?suggest= when neither alias exists (authenticated open mode)", async () => {
    await fc.assert(
      fc.asyncProperty(aliasArb, emailArb, async (alias, email) => {
        vi.clearAllMocks();
        mockUpdateAlias.mockResolvedValue(undefined as any);
        mockGetAlias.mockResolvedValue(undefined);

        const strategy = makeOpenAuthenticatedStrategy(email);
        const handler = createRedirectHandler(strategy);

        const req = makeRequest(alias);
        const res = await handler(req, makeContext());
        expect(res.status).toBe(302);
        const loc = (res.headers as Record<string, string>).location;
        expect(loc).toContain(`suggest=${encodeURIComponent(alias)}`);
      }),
      { numRuns: 100 },
    );
  });
});
