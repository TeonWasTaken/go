/**
 * Property tests for protected endpoint authentication enforcement.
 *
 * Feature: multi-tenant-auth-modes, Property 6: Protected endpoints reject unauthenticated requests
 */

import type { HttpRequest, InvocationContext } from "@azure/functions";
import fc from "fast-check";
import { beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock("@azure/functions", () => ({
  app: { http: vi.fn() },
}));

vi.mock("../../src/shared/cosmos-client.js", () => ({
  createAlias: vi.fn(),
  getAliasByPartition: vi.fn(),
  updateAlias: vi.fn(),
  deleteAlias: vi.fn(),
  listAliasesForUser: vi.fn(),
  searchAliases: vi.fn(),
  getPopularGlobalAliases: vi.fn(),
}));

import { createCreateLinkHandler } from "../../src/functions/createLink.js";
import { createDeleteLinkHandler } from "../../src/functions/deleteLink.js";
import { createGetLinksHandler } from "../../src/functions/getLinks.js";
import { createUpdateLinkHandler } from "../../src/functions/updateLink.js";
import type { AuthStrategy } from "../../src/shared/auth-strategy.js";

// ---------------------------------------------------------------------------
// Null-identity strategy: always returns null from extractIdentity
// ---------------------------------------------------------------------------

function makeNullStrategy(): AuthStrategy {
  return {
    mode: "public",
    redirectRequiresAuth: false,
    identityProviders: ["google"],
    extractIdentity: () => null,
  };
}

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

/** Random header maps (none will produce a valid identity with our null strategy) */
const headersArb = fc.dictionary(
  fc.stringOf(fc.constantFrom(..."abcdefghijklmnopqrstuvwxyz-"), {
    minLength: 1,
    maxLength: 20,
  }),
  fc.string({ minLength: 0, maxLength: 50 }),
  { minKeys: 0, maxKeys: 5 },
);

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

function makeCreateRequest(
  body: Record<string, unknown>,
  extraHeaders: Record<string, string> = {},
): HttpRequest {
  const headers = new Headers({
    "content-type": "application/json",
    ...extraHeaders,
  });
  return {
    url: "https://go.example.com/api/links",
    headers,
    method: "POST",
    json: vi.fn().mockResolvedValue(body),
    query: new URLSearchParams(),
    params: {},
  } as unknown as HttpRequest;
}

function makeUpdateRequest(
  alias: string,
  body: Record<string, unknown>,
  extraHeaders: Record<string, string> = {},
): HttpRequest {
  const headers = new Headers({
    "content-type": "application/json",
    ...extraHeaders,
  });
  return {
    url: `https://go.example.com/api/links/${alias}`,
    headers,
    method: "PUT",
    json: vi.fn().mockResolvedValue(body),
    query: new URLSearchParams(),
    params: { alias },
  } as unknown as HttpRequest;
}

function makeDeleteRequest(
  alias: string,
  extraHeaders: Record<string, string> = {},
): HttpRequest {
  const headers = new Headers(extraHeaders);
  return {
    url: `https://go.example.com/api/links/${alias}`,
    headers,
    method: "DELETE",
    query: new URLSearchParams(),
    params: { alias },
  } as unknown as HttpRequest;
}

function makeGetLinksRequest(
  extraHeaders: Record<string, string> = {},
): HttpRequest {
  const headers = new Headers(extraHeaders);
  return {
    url: "https://go.example.com/api/links",
    headers,
    method: "GET",
    query: new URLSearchParams(),
    params: {},
  } as unknown as HttpRequest;
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
});

// Feature: multi-tenant-auth-modes, Property 6: Protected endpoints reject unauthenticated requests
describe("Property 6: Protected endpoints reject unauthenticated requests", () => {
  /**
   * **Validates: Requirements 4.7, 4.8, 4.9, 4.10**
   *
   * For any protected endpoint (create, update, delete, list links) and for
   * any request that produces a null identity from the active AuthStrategy,
   * the handler returns HTTP 401.
   */

  const nullStrategy = makeNullStrategy();

  it("createLink returns 401 for any unauthenticated request", async () => {
    const handler = createCreateLinkHandler(nullStrategy);

    await fc.assert(
      fc.asyncProperty(
        aliasArb,
        destinationUrlArb,
        titleArb,
        headersArb,
        async (alias, destinationUrl, title, extraHeaders) => {
          const body = { alias, destination_url: destinationUrl, title };
          const req = makeCreateRequest(body, extraHeaders);
          const res = await handler(req, makeContext());
          expect(res.status).toBe(401);
        },
      ),
      { numRuns: 100 },
    );
  });

  it("updateLink returns 401 for any unauthenticated request", async () => {
    const handler = createUpdateLinkHandler(nullStrategy);

    await fc.assert(
      fc.asyncProperty(
        aliasArb,
        destinationUrlArb,
        headersArb,
        async (alias, destinationUrl, extraHeaders) => {
          const body = { destination_url: destinationUrl };
          const req = makeUpdateRequest(alias, body, extraHeaders);
          const res = await handler(req, makeContext());
          expect(res.status).toBe(401);
        },
      ),
      { numRuns: 100 },
    );
  });

  it("deleteLink returns 401 for any unauthenticated request", async () => {
    const handler = createDeleteLinkHandler(nullStrategy);

    await fc.assert(
      fc.asyncProperty(aliasArb, headersArb, async (alias, extraHeaders) => {
        const req = makeDeleteRequest(alias, extraHeaders);
        const res = await handler(req, makeContext());
        expect(res.status).toBe(401);
      }),
      { numRuns: 100 },
    );
  });

  it("getLinks returns 401 for any unauthenticated request", async () => {
    const handler = createGetLinksHandler(nullStrategy);

    await fc.assert(
      fc.asyncProperty(headersArb, async (extraHeaders) => {
        const req = makeGetLinksRequest(extraHeaders);
        const res = await handler(req, makeContext());
        expect(res.status).toBe(401);
      }),
      { numRuns: 100 },
    );
  });
});
