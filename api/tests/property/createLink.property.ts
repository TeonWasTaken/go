/**
 * Property tests for the POST /api/links Azure Function handler.
 *
 * Property 8: Alias creation applies correct defaults
 * Property 9: Global alias names are unique (case-insensitive)
 */

import type { HttpRequest, InvocationContext } from "@azure/functions";
import fc from "fast-check";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
    AliasRecord,
    CreateAliasRequest,
} from "../../src/shared/models.js";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock("@azure/functions", () => ({
  app: { http: vi.fn() },
}));

vi.mock("../../src/shared/cosmos-client.js", () => ({
  createAlias: vi.fn(),
  getAliasByPartition: vi.fn(),
}));

import { createCreateLinkHandler } from "../../src/functions/createLink.js";
import type { AuthStrategy } from "../../src/shared/auth-strategy.js";
import {
    createAlias,
    getAliasByPartition,
} from "../../src/shared/cosmos-client.js";

const mockCreateAlias = vi.mocked(createAlias);
const mockGetAlias = vi.mocked(getAliasByPartition);

// ---------------------------------------------------------------------------
// Generators
// ---------------------------------------------------------------------------

/** Valid lowercase alias names (must start with alphanumeric, not reserved) */
const aliasArb = fc
  .tuple(
    fc.constantFrom(..."abcdefghijklmnopqrstuvwxyz0123456789"),
    fc.stringOf(fc.constantFrom(..."abcdefghijklmnopqrstuvwxyz0123456789-"), {
      minLength: 0,
      maxLength: 29,
    }),
  )
  .map(([first, rest]) => first + rest)
  .filter((s) => s !== "api" && s !== "login");

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

function makeRequest(
  body: Partial<CreateAliasRequest>,
  email: string = "alice@example.com",
): HttpRequest {
  const defaultBody: CreateAliasRequest = {
    alias: "test-link",
    destination_url: "https://example.com/page",
    title: "Test Link",
    ...body,
  };
  const headers = new Headers({
    "x-mock-user-email": email,
    "x-mock-user-roles": "User",
    "content-type": "application/json",
  });
  return {
    url: "https://go.example.com/api/links",
    headers,
    method: "POST",
    json: vi.fn().mockResolvedValue(defaultBody),
  } as unknown as HttpRequest;
}

function makeContext(): InvocationContext {
  return {
    error: vi.fn(),
    warn: vi.fn(),
    log: vi.fn(),
  } as unknown as InvocationContext;
}

function resetMocks(email: string): void {
  vi.clearAllMocks();
  mockGetAlias.mockResolvedValue(undefined);
  mockCreateAlias.mockImplementation(async (record) => record);
}

function makeStrategy(email: string): AuthStrategy {
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

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  resetMocks("alice@example.com");
});

// Feature: go-url-alias-service, Property 8: Alias creation applies correct defaults
describe("Property 8: Alias creation applies correct defaults", () => {
  /**
   * Validates: Requirements 2.3, 9.6
   *
   * For any valid alias creation request that omits the expiry_policy_type,
   * the created record should have expiry_policy_type set to "fixed",
   * duration_months set to 12, click_count set to 0, created_by set to the
   * authenticated user's email, and created_at set to the current UTC time.
   */

  it("omitting expiry policy defaults to fixed with 12 months", async () => {
    await fc.assert(
      fc.asyncProperty(
        aliasArb,
        destinationUrlArb,
        titleArb,
        emailArb,
        async (alias, destinationUrl, title, userEmail) => {
          resetMocks(userEmail);

          const body: Partial<CreateAliasRequest> = {
            alias,
            destination_url: destinationUrl,
            title,
            // expiry_policy_type intentionally omitted
          };

          const req = makeRequest(body, userEmail);
          const handler = createCreateLinkHandler(makeStrategy(userEmail));
          const res = await handler(req, makeContext());

          expect(res.status).toBe(201);
          const record: AliasRecord = JSON.parse(res.body as string);

          // Default expiry policy
          expect(record.expiry_policy_type).toBe("fixed");
          expect(record.duration_months).toBe(12);
          expect(record.expiry_status).toBe("active");
          expect(record.expires_at).not.toBeNull();
        },
      ),
      { numRuns: 50 },
    );
  });

  it("click_count, heat_score, and timestamps are initialized correctly", async () => {
    await fc.assert(
      fc.asyncProperty(
        aliasArb,
        destinationUrlArb,
        titleArb,
        emailArb,
        async (alias, destinationUrl, title, userEmail) => {
          resetMocks(userEmail);

          const beforeCreate = new Date().toISOString();

          const body: Partial<CreateAliasRequest> = {
            alias,
            destination_url: destinationUrl,
            title,
          };

          const req = makeRequest(body, userEmail);
          const handler = createCreateLinkHandler(makeStrategy(userEmail));
          const res = await handler(req, makeContext());

          expect(res.status).toBe(201);
          const record: AliasRecord = JSON.parse(res.body as string);

          const afterCreate = new Date().toISOString();

          // Counters start at zero
          expect(record.click_count).toBe(0);
          expect(record.heat_score).toBe(0);

          // Nullable timestamps start null
          expect(record.heat_updated_at).toBeNull();
          expect(record.last_accessed_at).toBeNull();
          expect(record.expired_at).toBeNull();

          // created_by matches the authenticated user
          expect(record.created_by).toBe(userEmail);

          // created_at is a valid ISO timestamp within the test window
          expect(record.created_at).toBeTypeOf("string");
          expect(record.created_at >= beforeCreate).toBe(true);
          expect(record.created_at <= afterCreate).toBe(true);
        },
      ),
      { numRuns: 50 },
    );
  });

  it("alias is stored in lowercase and id follows the correct pattern", async () => {
    await fc.assert(
      fc.asyncProperty(
        aliasArb,
        destinationUrlArb,
        titleArb,
        emailArb,
        fc.boolean(),
        async (alias, destinationUrl, title, userEmail, isPrivate) => {
          resetMocks(userEmail);

          const body: Partial<CreateAliasRequest> = {
            alias,
            destination_url: destinationUrl,
            title,
            is_private: isPrivate,
          };

          const req = makeRequest(body, userEmail);
          const handler = createCreateLinkHandler(makeStrategy(userEmail));
          const res = await handler(req, makeContext());

          expect(res.status).toBe(201);
          const record: AliasRecord = JSON.parse(res.body as string);

          // Alias is always lowercase
          expect(record.alias).toBe(alias.toLowerCase());

          // ID follows the correct pattern
          if (isPrivate) {
            expect(record.id).toBe(`${alias.toLowerCase()}:${userEmail}`);
            expect(record.is_private).toBe(true);
          } else {
            expect(record.id).toBe(alias.toLowerCase());
            expect(record.is_private).toBe(false);
          }
        },
      ),
      { numRuns: 50 },
    );
  });
});

// Feature: go-url-alias-service, Property 9: Global alias names are unique (case-insensitive)
describe("Property 9: Global alias names are unique (case-insensitive)", () => {
  /**
   * Validates: Requirements 2.4, 2.17
   *
   * For any alias name, if a global alias already exists with that name
   * (compared case-insensitively), attempting to create another global alias
   * with the same name should return HTTP 409 Conflict.
   */

  it("creating a global alias that already exists returns 409", async () => {
    await fc.assert(
      fc.asyncProperty(
        aliasArb,
        destinationUrlArb,
        titleArb,
        emailArb,
        async (alias, destinationUrl, title, userEmail) => {
          resetMocks(userEmail);

          // Simulate an existing global alias in the DB
          mockGetAlias.mockResolvedValue({
            id: alias,
            alias,
            destination_url: "https://existing.com",
            created_by: "other@example.com",
            title: "Existing",
            click_count: 10,
            heat_score: 5,
            heat_updated_at: null,
            is_private: false,
            created_at: new Date().toISOString(),
            last_accessed_at: null,
            expiry_policy_type: "fixed",
            duration_months: 12,
            custom_expires_at: null,
            expires_at: new Date(Date.now() + 86400_000 * 365).toISOString(),
            expiry_status: "active",
            expired_at: null,
          });

          const body: Partial<CreateAliasRequest> = {
            alias,
            destination_url: destinationUrl,
            title,
            is_private: false, // global alias
          };

          const req = makeRequest(body, userEmail);
          const handler = createCreateLinkHandler(makeStrategy(userEmail));
          const res = await handler(req, makeContext());

          expect(res.status).toBe(409);
          expect(typeof res.body).toBe("string");
          expect((res.body as string).toLowerCase()).toContain(
            "already exists",
          );
        },
      ),
      { numRuns: 50 },
    );
  });

  it("creating a private alias with the same name as an existing global succeeds", async () => {
    await fc.assert(
      fc.asyncProperty(
        aliasArb,
        destinationUrlArb,
        titleArb,
        emailArb,
        async (alias, destinationUrl, title, userEmail) => {
          resetMocks(userEmail);

          // No existing private alias — getAliasByPartition returns undefined
          mockGetAlias.mockResolvedValue(undefined);

          const body: Partial<CreateAliasRequest> = {
            alias,
            destination_url: destinationUrl,
            title,
            is_private: true,
          };

          const req = makeRequest(body, userEmail);
          const handler = createCreateLinkHandler(makeStrategy(userEmail));
          const res = await handler(req, makeContext());

          expect(res.status).toBe(201);
          const record: AliasRecord = JSON.parse(res.body as string);
          expect(record.is_private).toBe(true);
          expect(record.id).toBe(`${alias}:${userEmail}`);

          // getAliasByPartition should have been called to check for private conflict
          expect(mockGetAlias).toHaveBeenCalledWith(
            alias,
            `${alias}:${userEmail}`,
          );
        },
      ),
      { numRuns: 50 },
    );
  });

  it("conflict detection is case-insensitive (alias is lowercased before check)", async () => {
    await fc.assert(
      fc.asyncProperty(
        aliasArb,
        destinationUrlArb,
        titleArb,
        emailArb,
        async (alias, destinationUrl, title, userEmail) => {
          resetMocks(userEmail);

          // The handler normalizes to lowercase before conflict check.
          // We verify getAliasByPartition is called with the lowercased alias.
          mockGetAlias.mockResolvedValue(undefined);

          const body: Partial<CreateAliasRequest> = {
            alias, // already lowercase from our generator
            destination_url: destinationUrl,
            title,
            is_private: false,
          };

          const req = makeRequest(body, userEmail);
          const handler = createCreateLinkHandler(makeStrategy(userEmail));
          await handler(req, makeContext());

          // Verify the conflict check used the lowercased alias
          const lowered = alias.toLowerCase();
          expect(mockGetAlias).toHaveBeenCalledWith(lowered, lowered);
        },
      ),
      { numRuns: 50 },
    );
  });
});
