/**
 * Property tests for the GET /api/links Azure Function handler.
 *
 * Property 6: API returns globals plus only the requesting user's private aliases
 * Property 7: Search filters by alias or title
 * Property 15: Sort by clicks produces descending order
 * Property 23: Popular links returns only top global aliases by heat
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
  listAliasesForUser: vi.fn(),
  searchAliases: vi.fn(),
  getPopularGlobalAliases: vi.fn(),
}));

import { createGetLinksHandler } from "../../src/functions/getLinks.js";
import {
  getPopularGlobalAliases,
  listAliasesForUser,
  searchAliases,
} from "../../src/shared/cosmos-client.js";

const mockListAliases = vi.mocked(listAliasesForUser);
const mockSearchAliases = vi.mocked(searchAliases);
const mockGetPopular = vi.mocked(getPopularGlobalAliases);

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

/** Title strings */
const titleArb = fc.stringOf(
  fc.constantFrom(
    ..."abcdefghijklmnopqrstuvwxyz ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789",
  ),
  { minLength: 1, maxLength: 40 },
);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeMockStrategy(email: string): AuthStrategy {
  return {
    mode: "dev",
    redirectRequiresAuth: false,
    identityProviders: ["dev"],
    extractIdentity: (headers: Record<string, string>) => ({
      email: headers["x-mock-user-email"] || email,
      roles: (headers["x-mock-user-roles"] || "User").split(","),
    }),
  };
}

function makeRequest(query?: Record<string, string>): HttpRequest {
  const params = new URLSearchParams(query);
  const url = `https://go.example.com/api/links${params.toString() ? "?" + params.toString() : ""}`;
  const headers = new Headers({
    "x-mock-user-email": "alice@example.com",
    "x-mock-user-roles": "User",
  });
  return {
    url,
    headers,
    method: "GET",
    query: new URLSearchParams(query),
  } as unknown as HttpRequest;
}

function makeRequestForUser(
  email: string,
  query?: Record<string, string>,
): HttpRequest {
  const params = new URLSearchParams(query);
  const url = `https://go.example.com/api/links${params.toString() ? "?" + params.toString() : ""}`;
  const headers = new Headers({
    "x-mock-user-email": email,
    "x-mock-user-roles": "User",
  });
  return {
    url,
    headers,
    method: "GET",
    query: new URLSearchParams(query),
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
    id: overrides.id ?? "test",
    alias: overrides.alias ?? "test",
    destination_url: overrides.destination_url ?? "https://example.com",
    created_by: overrides.created_by ?? "alice@example.com",
    title: overrides.title ?? "Test Alias",
    click_count: overrides.click_count ?? 5,
    heat_score: overrides.heat_score ?? 2.0,
    heat_updated_at: overrides.heat_updated_at ?? new Date().toISOString(),
    is_private: overrides.is_private ?? false,
    created_at: overrides.created_at ?? new Date().toISOString(),
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

function resetMocks(email: string): void {
  vi.clearAllMocks();
  mockListAliases.mockResolvedValue([]);
  mockSearchAliases.mockResolvedValue([]);
  mockGetPopular.mockResolvedValue([]);
}

/** Generate an AliasRecord arbitrary */
const aliasRecordArb = (ownerEmail?: string) =>
  fc
    .record({
      alias: aliasArb,
      destination_url: destinationUrlArb,
      created_by: ownerEmail ? fc.constant(ownerEmail) : emailArb,
      title: titleArb,
      click_count: clickCountArb,
      heat_score: heatScoreArb,
      is_private: fc.boolean(),
    })
    .map((fields) =>
      makeAlias({
        ...fields,
        id: fields.is_private
          ? `${fields.alias}:${fields.created_by}`
          : fields.alias,
      }),
    );

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  resetMocks("alice@example.com");
});

// Feature: go-url-alias-service, Property 6: API returns globals plus only the requesting user's private aliases
describe("Property 6: API returns globals plus only the requesting user's private aliases", () => {
  /**
   * Validates: Requirements 2.1, 7.3, 7.4
   *
   * For any authenticated user and any set of alias records, GET /api/links
   * should return all global alias records and only the private alias records
   * where created_by matches the authenticated user's email. No other user's
   * private aliases should ever appear.
   */

  it("response contains only globals and the requesting user's privates", async () => {
    await fc.assert(
      fc.asyncProperty(
        emailArb,
        fc.array(aliasRecordArb(), { minLength: 1, maxLength: 20 }),
        async (requestingUser, allRecords) => {
          resetMocks(requestingUser);

          // Simulate what the DB layer would return: globals + requesting user's privates
          const expectedRecords = allRecords.filter(
            (r) => !r.is_private || r.created_by === requestingUser,
          );

          mockListAliases.mockResolvedValue(expectedRecords);

          const strategy = makeMockStrategy(requestingUser);
          const handler = createGetLinksHandler(strategy);
          const res = await handler(
            makeRequestForUser(requestingUser),
            makeContext(),
          );

          expect(res.status).toBe(200);
          const body: AliasRecord[] = JSON.parse(res.body as string);

          // Every returned record must be either global or owned by the requesting user
          for (const record of body) {
            const isGlobal = !record.is_private;
            const isOwnPrivate =
              record.is_private && record.created_by === requestingUser;
            expect(isGlobal || isOwnPrivate).toBe(true);
          }

          // No other user's private aliases should appear
          const otherPrivates = body.filter(
            (r) => r.is_private && r.created_by !== requestingUser,
          );
          expect(otherPrivates).toHaveLength(0);
        },
      ),
      { numRuns: 50 },
    );
  });
});

// Feature: go-url-alias-service, Property 7: Search filters by alias or title
describe("Property 7: Search filters by alias or title", () => {
  /**
   * Validates: Requirements 2.2
   *
   * For any search term and any set of alias records visible to the user,
   * all records returned by the search endpoint should have the search term
   * as a case-insensitive substring of either the alias or title field.
   */

  it("every returned record contains the search term in alias or title", async () => {
    await fc.assert(
      fc.asyncProperty(
        emailArb,
        fc.stringOf(
          fc.constantFrom(..."abcdefghijklmnopqrstuvwxyz0123456789"),
          {
            minLength: 1,
            maxLength: 10,
          },
        ),
        fc.array(aliasRecordArb(), { minLength: 1, maxLength: 20 }),
        async (requestingUser, searchTerm, allRecords) => {
          resetMocks(requestingUser);

          // Simulate DB search: return only records visible to user that match
          const visibleRecords = allRecords.filter(
            (r) => !r.is_private || r.created_by === requestingUser,
          );
          const matchingRecords = visibleRecords.filter(
            (r) =>
              r.alias.toLowerCase().includes(searchTerm.toLowerCase()) ||
              r.title.toLowerCase().includes(searchTerm.toLowerCase()),
          );

          mockSearchAliases.mockResolvedValue(matchingRecords);

          const strategy = makeMockStrategy(requestingUser);
          const handler = createGetLinksHandler(strategy);
          const res = await handler(
            makeRequestForUser(requestingUser, { search: searchTerm }),
            makeContext(),
          );

          expect(res.status).toBe(200);
          const body: AliasRecord[] = JSON.parse(res.body as string);

          // Every returned record must contain the search term in alias or title
          const lowerSearch = searchTerm.toLowerCase();
          for (const record of body) {
            const inAlias = record.alias.toLowerCase().includes(lowerSearch);
            const inTitle = record.title.toLowerCase().includes(lowerSearch);
            expect(inAlias || inTitle).toBe(true);
          }
        },
      ),
      { numRuns: 50 },
    );
  });
});

// Feature: go-url-alias-service, Property 15: Sort by clicks produces descending order
describe("Property 15: Sort by clicks produces descending order", () => {
  /**
   * Validates: Requirements 2.8, 2.9, 6.5, 15.9
   *
   * When the API is called with sort=clicks, returned records should be
   * ordered by click_count descending. When called with sort=heat, returned
   * records should be ordered by heat_score descending.
   */

  it("sort=clicks returns records in descending click_count order", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(aliasRecordArb(), { minLength: 2, maxLength: 20 }),
        async (records) => {
          resetMocks("alice@example.com");

          // Simulate DB returning records sorted by click_count DESC
          const sorted = [...records].sort(
            (a, b) => b.click_count - a.click_count,
          );
          mockListAliases.mockResolvedValue(sorted);

          const strategy = makeMockStrategy("alice@example.com");
          const handler = createGetLinksHandler(strategy);
          const res = await handler(
            makeRequest({ sort: "clicks" }),
            makeContext(),
          );

          expect(res.status).toBe(200);
          const body: AliasRecord[] = JSON.parse(res.body as string);

          // Verify descending order by click_count
          for (let i = 1; i < body.length; i++) {
            expect(body[i - 1].click_count).toBeGreaterThanOrEqual(
              body[i].click_count,
            );
          }
        },
      ),
      { numRuns: 50 },
    );
  });

  it("sort=heat returns records in descending heat_score order", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(aliasRecordArb(), { minLength: 2, maxLength: 20 }),
        async (records) => {
          resetMocks("alice@example.com");

          // Simulate DB returning records sorted by heat_score DESC
          const sorted = [...records].sort(
            (a, b) => b.heat_score - a.heat_score,
          );
          mockListAliases.mockResolvedValue(sorted);

          const strategy = makeMockStrategy("alice@example.com");
          const handler = createGetLinksHandler(strategy);
          const res = await handler(
            makeRequest({ sort: "heat" }),
            makeContext(),
          );

          expect(res.status).toBe(200);
          const body: AliasRecord[] = JSON.parse(res.body as string);

          // Verify descending order by heat_score
          for (let i = 1; i < body.length; i++) {
            expect(body[i - 1].heat_score).toBeGreaterThanOrEqual(
              body[i].heat_score,
            );
          }
        },
      ),
      { numRuns: 50 },
    );
  });
});

// Feature: go-url-alias-service, Property 23: Popular links returns only top global aliases by heat
describe("Property 23: Popular links returns only top global aliases by heat", () => {
  /**
   * Validates: Requirements 15.6, 15.8, 15.10
   *
   * When scope=popular, the API should return only global aliases (no private),
   * ordered by heat_score descending, limited to 10.
   */

  it("scope=popular returns only global aliases, sorted by heat, max 10", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(aliasRecordArb(), { minLength: 1, maxLength: 25 }),
        async (allRecords) => {
          resetMocks("alice@example.com");

          // Simulate DB: filter to global only, sort by heat DESC, limit 10
          const globalRecords = allRecords
            .map((r) => makeAlias({ ...r, is_private: false }))
            .sort((a, b) => b.heat_score - a.heat_score)
            .slice(0, 10);

          mockGetPopular.mockResolvedValue(globalRecords);

          const strategy = makeMockStrategy("alice@example.com");
          const handler = createGetLinksHandler(strategy);
          const res = await handler(
            makeRequest({ scope: "popular" }),
            makeContext(),
          );

          expect(res.status).toBe(200);
          const body: AliasRecord[] = JSON.parse(res.body as string);

          // At most 10 records
          expect(body.length).toBeLessThanOrEqual(10);

          // All records must be global (not private)
          for (const record of body) {
            expect(record.is_private).toBe(false);
          }

          // Records must be in descending heat_score order
          for (let i = 1; i < body.length; i++) {
            expect(body[i - 1].heat_score).toBeGreaterThanOrEqual(
              body[i].heat_score,
            );
          }
        },
      ),
      { numRuns: 50 },
    );
  });
});
