/**
 * Property tests for the PUT /api/links/:alias Azure Function handler.
 *
 * Property 13: Update recalculates expiry and resets status
 * Property 16: Authorization enforces role-based access
 */

import type { HttpRequest, InvocationContext } from "@azure/functions";
import fc from "fast-check";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  AliasRecord,
  UpdateAliasRequest,
} from "../../src/shared/models.js";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock("@azure/functions", () => ({ app: { http: vi.fn() } }));
vi.mock("../../src/shared/cosmos-client.js", () => ({
  getAliasByPartition: vi.fn(),
  updateAlias: vi.fn(),
}));

import { createUpdateLinkHandler } from "../../src/functions/updateLink.js";
import type { AuthStrategy } from "../../src/shared/auth-strategy.js";
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
const destinationUrlArb = fc
  .tuple(
    fc.constantFrom("https://", "http://"),
    fc.constantFrom("example.com", "docs.internal.net", "wiki.corp.com"),
    fc.constantFrom("", "/page", "/docs/guide", "/a/b/c"),
  )
  .map(([proto, host, path]) => `${proto}${host}${path}`);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRequest(
  alias: string,
  body: Partial<UpdateAliasRequest>,
  email = "alice@example.com",
  roles = "User",
): HttpRequest {
  const headers = new Headers({
    "x-mock-user-email": email,
    "x-mock-user-roles": roles,
    "content-type": "application/json",
  });
  return {
    url: `https://go.example.com/api/links/${alias}`,
    headers,
    method: "PUT",
    params: { alias },
    json: vi.fn().mockResolvedValue(body),
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
    expires_at: new Date(Date.now() + 86400_000 * 365).toISOString(),
    expiry_status: "active",
    expired_at: null,
    ...overrides,
  };
}

function makeStrategy(email: string, roles: string[]): AuthStrategy {
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

beforeEach(() => {
  vi.clearAllMocks();
  mockUpdateAlias.mockImplementation(async (record) => record);
});

// ---------------------------------------------------------------------------
// Property 13: Update recalculates expiry and resets status
// ---------------------------------------------------------------------------
describe("Property 13: Update recalculates expiry and resets status", () => {
  /** Validates: Requirements 2.5, 2.6 */

  it("updating expiry_policy_type to 'never' sets expires_at to null and expiry_status to 'no_expiry'", async () => {
    await fc.assert(
      fc.asyncProperty(
        aliasArb,
        emailArb,
        fc.constantFrom<"active" | "expiring_soon" | "expired">(
          "active",
          "expiring_soon",
          "expired",
        ),
        async (alias, creatorEmail, previousStatus) => {
          vi.clearAllMocks();
          mockUpdateAlias.mockImplementation(async (record) => record);
          const existing = makeAlias({
            id: alias,
            alias,
            created_by: creatorEmail,
            is_private: false,
            expiry_policy_type: "fixed",
            duration_months: 12,
            expiry_status: previousStatus,
          });
          mockGetAlias.mockImplementation(async (_a, id) => {
            if (id === alias) return existing;
            return undefined;
          });
          const handler = createUpdateLinkHandler(
            makeStrategy(creatorEmail, ["User"]),
          );
          const res = await handler(
            makeRequest(alias, { expiry_policy_type: "never" }, creatorEmail),
            makeContext(),
          );
          expect(res.status).toBe(200);
          const body: AliasRecord = JSON.parse(res.body as string);
          expect(body.expiry_policy_type).toBe("never");
          expect(body.expires_at).toBeNull();
          expect(body.expiry_status).toBe("no_expiry");
        },
      ),
      { numRuns: 50 },
    );
  });

  it("updating expiry_policy_type to 'fixed' with duration_months recalculates expires_at and resets status to 'active'", async () => {
    await fc.assert(
      fc.asyncProperty(
        aliasArb,
        emailArb,
        fc.constantFrom<1 | 3 | 12>(1, 3, 12),
        fc.constantFrom<"expiring_soon" | "expired" | "no_expiry">(
          "expiring_soon",
          "expired",
          "no_expiry",
        ),
        async (alias, creatorEmail, durationMonths, previousStatus) => {
          vi.clearAllMocks();
          mockUpdateAlias.mockImplementation(async (record) => record);
          const existing = makeAlias({
            id: alias,
            alias,
            created_by: creatorEmail,
            is_private: false,
            expiry_policy_type: "never",
            duration_months: null,
            expires_at: null,
            expiry_status: previousStatus,
          });
          mockGetAlias.mockImplementation(async (_a, id) => {
            if (id === alias) return existing;
            return undefined;
          });
          const beforeUpdate = Date.now();
          const handler = createUpdateLinkHandler(
            makeStrategy(creatorEmail, ["User"]),
          );
          const res = await handler(
            makeRequest(
              alias,
              { expiry_policy_type: "fixed", duration_months: durationMonths },
              creatorEmail,
            ),
            makeContext(),
          );
          const afterUpdate = Date.now();
          expect(res.status).toBe(200);
          const body: AliasRecord = JSON.parse(res.body as string);
          expect(body.expiry_policy_type).toBe("fixed");
          expect(body.duration_months).toBe(durationMonths);
          expect(body.expiry_status).toBe("active");
          expect(body.expires_at).not.toBeNull();
          const expiresAt = new Date(body.expires_at!).getTime();
          const expectedMin = new Date(beforeUpdate);
          expectedMin.setUTCMonth(expectedMin.getUTCMonth() + durationMonths);
          const expectedMax = new Date(afterUpdate);
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

  it("updating expiry_policy_type to 'inactivity' sets expires_at to ~12 months from now and resets status to 'active'", async () => {
    await fc.assert(
      fc.asyncProperty(
        aliasArb,
        emailArb,
        fc.constantFrom<"expiring_soon" | "expired" | "no_expiry">(
          "expiring_soon",
          "expired",
          "no_expiry",
        ),
        async (alias, creatorEmail, previousStatus) => {
          vi.clearAllMocks();
          mockUpdateAlias.mockImplementation(async (record) => record);
          const existing = makeAlias({
            id: alias,
            alias,
            created_by: creatorEmail,
            is_private: false,
            expiry_policy_type: "never",
            expires_at: null,
            expiry_status: previousStatus,
          });
          mockGetAlias.mockImplementation(async (_a, id) => {
            if (id === alias) return existing;
            return undefined;
          });
          const beforeUpdate = Date.now();
          const handler = createUpdateLinkHandler(
            makeStrategy(creatorEmail, ["User"]),
          );
          const res = await handler(
            makeRequest(
              alias,
              { expiry_policy_type: "inactivity" },
              creatorEmail,
            ),
            makeContext(),
          );
          const afterUpdate = Date.now();
          expect(res.status).toBe(200);
          const body: AliasRecord = JSON.parse(res.body as string);
          expect(body.expiry_policy_type).toBe("inactivity");
          expect(body.expiry_status).toBe("active");
          expect(body.expires_at).not.toBeNull();
          const expiresAt = new Date(body.expires_at!).getTime();
          const expectedMin = new Date(beforeUpdate);
          expectedMin.setUTCMonth(expectedMin.getUTCMonth() + 12);
          const expectedMax = new Date(afterUpdate);
          expectedMax.setUTCMonth(expectedMax.getUTCMonth() + 12);
          expect(expiresAt).toBeGreaterThanOrEqual(
            expectedMin.getTime() - 1000,
          );
          expect(expiresAt).toBeLessThanOrEqual(expectedMax.getTime() + 1000);
        },
      ),
      { numRuns: 50 },
    );
  });

  it("previous expiry_status (expiring_soon, expired) is reset on policy change", async () => {
    await fc.assert(
      fc.asyncProperty(
        aliasArb,
        emailArb,
        fc.constantFrom<"expiring_soon" | "expired">(
          "expiring_soon",
          "expired",
        ),
        fc.constantFrom<"never" | "fixed" | "inactivity">(
          "never",
          "fixed",
          "inactivity",
        ),
        async (alias, creatorEmail, previousStatus, newPolicy) => {
          vi.clearAllMocks();
          mockUpdateAlias.mockImplementation(async (record) => record);
          const existing = makeAlias({
            id: alias,
            alias,
            created_by: creatorEmail,
            is_private: false,
            expiry_policy_type: "fixed",
            duration_months: 12,
            expiry_status: previousStatus,
          });
          mockGetAlias.mockImplementation(async (_a, id) => {
            if (id === alias) return existing;
            return undefined;
          });
          const body: Partial<UpdateAliasRequest> = {
            expiry_policy_type: newPolicy,
          };
          if (newPolicy === "fixed") {
            body.duration_months = 3;
          }
          const handler = createUpdateLinkHandler(
            makeStrategy(creatorEmail, ["User"]),
          );
          const res = await handler(
            makeRequest(alias, body, creatorEmail),
            makeContext(),
          );
          expect(res.status).toBe(200);
          const result: AliasRecord = JSON.parse(res.body as string);
          if (newPolicy === "never") {
            expect(result.expiry_status).toBe("no_expiry");
          } else {
            expect(result.expiry_status).toBe("active");
          }
        },
      ),
      { numRuns: 50 },
    );
  });
});

// ---------------------------------------------------------------------------
// Property 16: Authorization enforces role-based access
// ---------------------------------------------------------------------------
describe("Property 16: Authorization enforces role-based access", () => {
  /** Validates: Requirements 3.3, 3.4, 3.5, 2.10 */

  it("a User who did not create a global alias gets 403", async () => {
    await fc.assert(
      fc.asyncProperty(
        aliasArb,
        emailArb,
        emailArb,
        destinationUrlArb,
        async (alias, creatorEmail, requesterEmail, newUrl) => {
          fc.pre(creatorEmail !== requesterEmail);
          vi.clearAllMocks();
          mockUpdateAlias.mockImplementation(async (record) => record);
          const existing = makeAlias({
            id: alias,
            alias,
            created_by: creatorEmail,
            is_private: false,
          });
          mockGetAlias.mockImplementation(async (_a, id) => {
            if (id === `${alias}:${requesterEmail}`) return undefined;
            if (id === alias) return existing;
            return undefined;
          });
          const handler = createUpdateLinkHandler(
            makeStrategy(requesterEmail, ["User"]),
          );
          const res = await handler(
            makeRequest(
              alias,
              { destination_url: newUrl },
              requesterEmail,
              "User",
            ),
            makeContext(),
          );
          expect(res.status).toBe(403);
        },
      ),
      { numRuns: 50 },
    );
  });

  it("an Admin can update any global alias regardless of creator", async () => {
    await fc.assert(
      fc.asyncProperty(
        aliasArb,
        emailArb,
        emailArb,
        destinationUrlArb,
        async (alias, creatorEmail, adminEmail, newUrl) => {
          fc.pre(creatorEmail !== adminEmail);
          vi.clearAllMocks();
          mockUpdateAlias.mockImplementation(async (record) => record);
          const existing = makeAlias({
            id: alias,
            alias,
            created_by: creatorEmail,
            is_private: false,
          });
          mockGetAlias.mockImplementation(async (_a, id) => {
            if (id === `${alias}:${adminEmail}`) return undefined;
            if (id === alias) return existing;
            return undefined;
          });
          const handler = createUpdateLinkHandler(
            makeStrategy(adminEmail, ["Admin"]),
          );
          const res = await handler(
            makeRequest(
              alias,
              { destination_url: newUrl },
              adminEmail,
              "Admin",
            ),
            makeContext(),
          );
          expect(res.status).toBe(200);
          const body: AliasRecord = JSON.parse(res.body as string);
          expect(body.destination_url).toBe(newUrl);
        },
      ),
      { numRuns: 50 },
    );
  });

  it("an Admin gets 403 when trying to update another user's private alias", async () => {
    await fc.assert(
      fc.asyncProperty(
        aliasArb,
        emailArb,
        emailArb,
        destinationUrlArb,
        async (alias, creatorEmail, adminEmail, newUrl) => {
          fc.pre(creatorEmail !== adminEmail);
          vi.clearAllMocks();
          mockUpdateAlias.mockImplementation(async (record) => record);
          const existing = makeAlias({
            id: `${alias}:${creatorEmail}`,
            alias,
            created_by: creatorEmail,
            is_private: true,
          });
          mockGetAlias.mockImplementation(async (_a, id) => {
            if (id === `${alias}:${adminEmail}`) return existing;
            return undefined;
          });
          const handler = createUpdateLinkHandler(
            makeStrategy(adminEmail, ["Admin"]),
          );
          const res = await handler(
            makeRequest(
              alias,
              { destination_url: newUrl },
              adminEmail,
              "Admin",
            ),
            makeContext(),
          );
          expect(res.status).toBe(403);
        },
      ),
      { numRuns: 50 },
    );
  });

  it("creator can always update their own alias (global or private)", async () => {
    await fc.assert(
      fc.asyncProperty(
        aliasArb,
        emailArb,
        destinationUrlArb,
        fc.boolean(),
        async (alias, creatorEmail, newUrl, isPrivate) => {
          vi.clearAllMocks();
          mockUpdateAlias.mockImplementation(async (record) => record);
          const id = isPrivate ? `${alias}:${creatorEmail}` : alias;
          const existing = makeAlias({
            id,
            alias,
            created_by: creatorEmail,
            is_private: isPrivate,
          });
          mockGetAlias.mockImplementation(async (_a, lookupId) => {
            if (isPrivate) {
              if (lookupId === `${alias}:${creatorEmail}`) return existing;
              return undefined;
            } else {
              if (lookupId === `${alias}:${creatorEmail}`) return undefined;
              if (lookupId === alias) return existing;
              return undefined;
            }
          });
          const handler = createUpdateLinkHandler(
            makeStrategy(creatorEmail, ["User"]),
          );
          const res = await handler(
            makeRequest(
              alias,
              { destination_url: newUrl },
              creatorEmail,
              "User",
            ),
            makeContext(),
          );
          expect(res.status).toBe(200);
          const body: AliasRecord = JSON.parse(res.body as string);
          expect(body.destination_url).toBe(newUrl);
        },
      ),
      { numRuns: 50 },
    );
  });
});
