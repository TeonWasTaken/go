/**
 * Property tests for the DELETE /api/links/:alias Azure Function handler.
 *
 * Property 14: Delete removes the record
 * Validates: Requirements 2.7
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
  deleteAlias: vi.fn(),
}));

import { createDeleteLinkHandler } from "../../src/functions/deleteLink.js";
import {
  deleteAlias,
  getAliasByPartition,
} from "../../src/shared/cosmos-client.js";

const mockGetAlias = vi.mocked(getAliasByPartition);
const mockDeleteAlias = vi.mocked(deleteAlias);

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
    url: `https://go.example.com/api/links/${alias}`,
    headers,
    method: "DELETE",
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
    expires_at: new Date(Date.now() + 86400_000 * 365).toISOString(),
    expiry_status: "active",
    expired_at: null,
    icon_url: null,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
  mockDeleteAlias.mockResolvedValue(undefined);
});

// ---------------------------------------------------------------------------
// Property 14: Delete removes the record
// ---------------------------------------------------------------------------

describe("Property 14: Delete removes the record", () => {
  /**
   * Validates: Requirements 2.7
   *
   * For any alias record owned by the authenticated user, after a successful
   * DELETE request, the record should no longer exist in the database and
   * should not appear in subsequent GET responses.
   */

  it("creator deleting own global alias calls deleteAlias with correct id and returns 204", async () => {
    await fc.assert(
      fc.asyncProperty(aliasArb, emailArb, async (alias, creatorEmail) => {
        vi.clearAllMocks();
        mockDeleteAlias.mockResolvedValue(undefined);

        const existing = makeAlias({
          id: alias,
          alias,
          created_by: creatorEmail,
          is_private: false,
        });

        mockGetAlias.mockImplementation(async (_a, id) => {
          if (id === `${alias}:${creatorEmail}`) return undefined;
          if (id === alias) return existing;
          return undefined;
        });

        const handler = createDeleteLinkHandler(
          makeStrategy(creatorEmail, ["User"]),
        );
        const res = await handler(
          makeRequest(alias, creatorEmail),
          makeContext(),
        );

        expect(res.status).toBe(204);
        expect(mockDeleteAlias).toHaveBeenCalledOnce();
        expect(mockDeleteAlias).toHaveBeenCalledWith(alias, alias);
      }),
      { numRuns: 50 },
    );
  });

  it("creator deleting own private alias calls deleteAlias with composite id and returns 204", async () => {
    await fc.assert(
      fc.asyncProperty(aliasArb, emailArb, async (alias, creatorEmail) => {
        vi.clearAllMocks();
        mockDeleteAlias.mockResolvedValue(undefined);

        const compositeId = `${alias}:${creatorEmail}`;
        const existing = makeAlias({
          id: compositeId,
          alias,
          created_by: creatorEmail,
          is_private: true,
        });

        mockGetAlias.mockImplementation(async (_a, id) => {
          if (id === compositeId) return existing;
          return undefined;
        });

        const handler = createDeleteLinkHandler(
          makeStrategy(creatorEmail, ["User"]),
        );
        const res = await handler(
          makeRequest(alias, creatorEmail),
          makeContext(),
        );

        expect(res.status).toBe(204);
        expect(mockDeleteAlias).toHaveBeenCalledOnce();
        expect(mockDeleteAlias).toHaveBeenCalledWith(alias, compositeId);
      }),
      { numRuns: 50 },
    );
  });

  it("after successful delete, a subsequent lookup for the same alias returns 404", async () => {
    await fc.assert(
      fc.asyncProperty(
        aliasArb,
        emailArb,
        fc.boolean(),
        async (alias, creatorEmail, isPrivate) => {
          vi.clearAllMocks();
          mockDeleteAlias.mockResolvedValue(undefined);

          const id = isPrivate ? `${alias}:${creatorEmail}` : alias;
          const existing = makeAlias({
            id,
            alias,
            created_by: creatorEmail,
            is_private: isPrivate,
          });

          // Track whether delete has been called
          let deleted = false;
          mockGetAlias.mockImplementation(async (_a, lookupId) => {
            if (deleted) return undefined;
            if (isPrivate && lookupId === `${alias}:${creatorEmail}`)
              return existing;
            if (!isPrivate && lookupId === `${alias}:${creatorEmail}`)
              return undefined;
            if (!isPrivate && lookupId === alias) return existing;
            return undefined;
          });
          mockDeleteAlias.mockImplementation(async () => {
            deleted = true;
          });

          const strategy = makeStrategy(creatorEmail, ["User"]);
          const handler = createDeleteLinkHandler(strategy);

          // First call: delete succeeds
          const res = await handler(
            makeRequest(alias, creatorEmail),
            makeContext(),
          );
          expect(res.status).toBe(204);

          // Second call: record is gone, should return 404
          const res2 = await handler(
            makeRequest(alias, creatorEmail),
            makeContext(),
          );
          expect(res2.status).toBe(404);
        },
      ),
      { numRuns: 50 },
    );
  });

  it("delete is not called when alias does not exist (returns 404)", async () => {
    await fc.assert(
      fc.asyncProperty(aliasArb, emailArb, async (alias, requesterEmail) => {
        vi.clearAllMocks();
        mockDeleteAlias.mockResolvedValue(undefined);

        mockGetAlias.mockResolvedValue(undefined);

        const handler = createDeleteLinkHandler(
          makeStrategy(requesterEmail, ["User"]),
        );
        const res = await handler(
          makeRequest(alias, requesterEmail),
          makeContext(),
        );

        expect(res.status).toBe(404);
        expect(mockDeleteAlias).not.toHaveBeenCalled();
      }),
      { numRuns: 50 },
    );
  });
});
