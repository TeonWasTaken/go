/**
 * Unit tests for the GET /api/links Azure Function handler.
 */

import type { HttpRequest, InvocationContext } from "@azure/functions";
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
  getPopularGlobalAliasesByClicks: vi.fn(),
}));

import { createGetLinksHandler } from "../../src/functions/getLinks.js";
import {
    getPopularGlobalAliases,
    getPopularGlobalAliasesByClicks,
    listAliasesForUser,
    searchAliases,
} from "../../src/shared/cosmos-client.js";

const mockListAliases = vi.mocked(listAliasesForUser);
const mockSearchAliases = vi.mocked(searchAliases);
const mockGetPopular = vi.mocked(getPopularGlobalAliases);
const mockGetPopularByClicks = vi.mocked(getPopularGlobalAliasesByClicks);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeMockStrategy(overrides: Partial<AuthStrategy> = {}): AuthStrategy {
  return {
    mode: "dev",
    redirectRequiresAuth: false,
    identityProviders: ["dev"],
    extractIdentity: (headers: Record<string, string>) => ({
      email: headers["x-mock-user-email"] || "alice@example.com",
      roles: (headers["x-mock-user-roles"] || "User").split(","),
    }),
    ...overrides,
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

function makeContext(): InvocationContext {
  return {
    error: vi.fn(),
    warn: vi.fn(),
    log: vi.fn(),
  } as unknown as InvocationContext;
}

function makeAlias(overrides: Partial<AliasRecord> = {}): AliasRecord {
  return {
    id: "test",
    alias: "test",
    destination_url: "https://example.com",
    created_by: "alice@example.com",
    title: "Test Alias",
    click_count: 5,
    heat_score: 2.0,
    heat_updated_at: new Date().toISOString(),
    is_private: false,
    created_at: new Date().toISOString(),
    last_accessed_at: null,
    expiry_policy_type: "fixed",
    duration_months: 12,
    custom_expires_at: null,
    expires_at: new Date(Date.now() + 86400_000 * 300).toISOString(),
    expiry_status: "active",
    expired_at: null,
    icon_url: null,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

let strategy: AuthStrategy;

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.CACHE_MAX_AGE_POPULAR;
  strategy = makeMockStrategy();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("getLinks handler", () => {
  it("returns 401 when strategy returns null identity", async () => {
    strategy = makeMockStrategy({ extractIdentity: () => null });
    const handler = createGetLinksHandler(strategy);
    const res = await handler(makeRequest(), makeContext());
    expect(res.status).toBe(401);
  });

  it("returns aliases from listAliasesForUser by default", async () => {
    const aliases = [makeAlias({ alias: "a" }), makeAlias({ alias: "b" })];
    mockListAliases.mockResolvedValue(aliases);

    const handler = createGetLinksHandler(strategy);
    const res = await handler(makeRequest(), makeContext());
    expect(res.status).toBe(200);
    expect(res.headers).toHaveProperty("content-type", "application/json");
    expect(JSON.parse(res.body as string)).toEqual(aliases);
    expect(mockListAliases).toHaveBeenCalledWith(
      "alice@example.com",
      undefined,
    );
  });

  it("passes sort=clicks to listAliasesForUser", async () => {
    mockListAliases.mockResolvedValue([]);
    const handler = createGetLinksHandler(strategy);
    await handler(makeRequest({ sort: "clicks" }), makeContext());
    expect(mockListAliases).toHaveBeenCalledWith("alice@example.com", "clicks");
  });

  it("passes sort=heat to listAliasesForUser", async () => {
    mockListAliases.mockResolvedValue([]);
    const handler = createGetLinksHandler(strategy);
    await handler(makeRequest({ sort: "heat" }), makeContext());
    expect(mockListAliases).toHaveBeenCalledWith("alice@example.com", "heat");
  });

  it("uses searchAliases when search param is provided", async () => {
    const aliases = [makeAlias({ alias: "docs", title: "Documentation" })];
    mockSearchAliases.mockResolvedValue(aliases);

    const handler = createGetLinksHandler(strategy);
    const res = await handler(makeRequest({ search: "doc" }), makeContext());
    expect(res.status).toBe(200);
    expect(JSON.parse(res.body as string)).toEqual(aliases);
    expect(mockSearchAliases).toHaveBeenCalledWith("alice@example.com", "doc");
    expect(mockListAliases).not.toHaveBeenCalled();
  });

  it("uses getPopularGlobalAliases when scope=popular", async () => {
    const popular = [makeAlias({ alias: "hot", heat_score: 50 })];
    mockGetPopular.mockResolvedValue(popular);

    const handler = createGetLinksHandler(strategy);
    const res = await handler(makeRequest({ scope: "popular" }), makeContext());
    expect(res.status).toBe(200);
    expect(JSON.parse(res.body as string)).toEqual(popular);
    expect(mockGetPopular).toHaveBeenCalledWith(10);
    expect(mockListAliases).not.toHaveBeenCalled();
    expect(mockSearchAliases).not.toHaveBeenCalled();
  });

  it("scope=popular takes precedence over search", async () => {
    mockGetPopular.mockResolvedValue([]);
    const handler = createGetLinksHandler(strategy);
    await handler(
      makeRequest({ scope: "popular", search: "test" }),
      makeContext(),
    );
    expect(mockGetPopular).toHaveBeenCalledWith(10);
    expect(mockSearchAliases).not.toHaveBeenCalled();
  });

  it("includes click_count, last_accessed_at, heat_score in response records", async () => {
    const alias = makeAlias({
      click_count: 42,
      last_accessed_at: "2024-01-15T10:00:00.000Z",
      heat_score: 7.5,
    });
    mockListAliases.mockResolvedValue([alias]);

    const handler = createGetLinksHandler(strategy);
    const res = await handler(makeRequest(), makeContext());
    const body = JSON.parse(res.body as string);
    expect(body[0].click_count).toBe(42);
    expect(body[0].last_accessed_at).toBe("2024-01-15T10:00:00.000Z");
    expect(body[0].heat_score).toBe(7.5);
  });

  it("returns 500 on unexpected error", async () => {
    mockListAliases.mockRejectedValue(new Error("DB failure"));
    const handler = createGetLinksHandler(strategy);
    const ctx = makeContext();
    const res = await handler(makeRequest(), ctx);
    expect(res.status).toBe(500);
    expect(ctx.error).toHaveBeenCalled();
  });

  it("returns Cache-Control header with default max-age=3600 for scope=popular", async () => {
    delete process.env.CACHE_MAX_AGE_POPULAR;
    mockGetPopular.mockResolvedValue([]);

    const handler = createGetLinksHandler(strategy);
    const res = await handler(makeRequest({ scope: "popular" }), makeContext());
    expect(res.status).toBe(200);
    expect(res.headers).toHaveProperty("cache-control", "public, max-age=3600");
  });

  it("returns Cache-Control header with default max-age=3600 for scope=popular-clicks", async () => {
    delete process.env.CACHE_MAX_AGE_POPULAR;
    mockGetPopularByClicks.mockResolvedValue([]);

    const handler = createGetLinksHandler(strategy);
    const res = await handler(
      makeRequest({ scope: "popular-clicks" }),
      makeContext(),
    );
    expect(res.status).toBe(200);
    expect(res.headers).toHaveProperty("cache-control", "public, max-age=3600");
  });

  it("CP-10: uses custom CACHE_MAX_AGE_POPULAR for scope=popular", async () => {
    process.env.CACHE_MAX_AGE_POPULAR = "7200";
    mockGetPopular.mockResolvedValue([]);

    const handler = createGetLinksHandler(strategy);
    const res = await handler(makeRequest({ scope: "popular" }), makeContext());
    expect(res.status).toBe(200);
    expect(res.headers).toHaveProperty("cache-control", "public, max-age=7200");

    delete process.env.CACHE_MAX_AGE_POPULAR;
  });

  it("CP-10: uses custom CACHE_MAX_AGE_POPULAR for scope=popular-clicks", async () => {
    process.env.CACHE_MAX_AGE_POPULAR = "7200";
    mockGetPopularByClicks.mockResolvedValue([]);

    const handler = createGetLinksHandler(strategy);
    const res = await handler(
      makeRequest({ scope: "popular-clicks" }),
      makeContext(),
    );
    expect(res.status).toBe(200);
    expect(res.headers).toHaveProperty("cache-control", "public, max-age=7200");

    delete process.env.CACHE_MAX_AGE_POPULAR;
  });

  it("does not include cache-control header for non-popular scopes", async () => {
    mockListAliases.mockResolvedValue([]);

    const handler = createGetLinksHandler(strategy);
    const res = await handler(makeRequest(), makeContext());
    expect(res.status).toBe(200);
    expect(res.headers).toEqual({ "content-type": "application/json" });
  });
});

// ---------------------------------------------------------------------------
// Integration tests — read-time expiry status correction
// ---------------------------------------------------------------------------

describe("getLinks handler — stale expiry_status correction", () => {
  // Fixed reference date: 2025-07-01T00:00:00Z
  const NOW = new Date("2025-07-01T00:00:00Z");

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("corrects stale expiry_status from 'active' to 'expired' for past expires_at in default listing", async () => {
    const staleRecord = makeAlias({
      alias: "stale-link",
      // Expired 2 months ago
      expires_at: "2025-05-01T00:00:00Z",
      expiry_status: "active",
      expired_at: null,
    });
    mockListAliases.mockResolvedValue([staleRecord]);

    const handler = createGetLinksHandler(strategy);
    const res = await handler(makeRequest(), makeContext());
    expect(res.status).toBe(200);

    const body = JSON.parse(res.body as string);
    expect(body).toHaveLength(1);
    expect(body[0].expiry_status).toBe("expired");
    expect(body[0].expired_at).toBeTruthy();
  });

  it("corrects stale expiry_status to 'expiring_soon' when expires_at is within 30 days", async () => {
    const staleRecord = makeAlias({
      alias: "soon-link",
      // Expires in 15 days from NOW
      expires_at: "2025-07-16T00:00:00Z",
      expiry_status: "active",
      expired_at: null,
    });
    mockListAliases.mockResolvedValue([staleRecord]);

    const handler = createGetLinksHandler(strategy);
    const res = await handler(makeRequest(), makeContext());
    expect(res.status).toBe(200);

    const body = JSON.parse(res.body as string);
    expect(body).toHaveLength(1);
    expect(body[0].expiry_status).toBe("expiring_soon");
  });

  it("corrects stale expiry_status in scope=popular results", async () => {
    const expiredRecord = makeAlias({
      alias: "old-popular",
      expires_at: "2025-03-01T00:00:00Z",
      expiry_status: "active",
      expired_at: null,
      heat_score: 50,
    });
    const activeRecord = makeAlias({
      alias: "fresh-popular",
      expires_at: "2026-06-01T00:00:00Z",
      expiry_status: "active",
      expired_at: null,
      heat_score: 40,
    });
    mockGetPopular.mockResolvedValue([expiredRecord, activeRecord]);

    const handler = createGetLinksHandler(strategy);
    const res = await handler(makeRequest({ scope: "popular" }), makeContext());
    expect(res.status).toBe(200);

    const body = JSON.parse(res.body as string);
    expect(body).toHaveLength(2);
    // Expired record should be corrected
    expect(body[0].expiry_status).toBe("expired");
    expect(body[0].expired_at).toBeTruthy();
    // Active record (11 months out) should remain active
    expect(body[1].expiry_status).toBe("active");
    expect(body[1].expired_at).toBeNull();
  });

  it("leaves records with expiry_policy_type 'never' unchanged", async () => {
    const neverRecord = makeAlias({
      alias: "permanent",
      expiry_policy_type: "never",
      expires_at: null,
      expiry_status: "no_expiry",
      expired_at: null,
      duration_months: null,
    });
    mockListAliases.mockResolvedValue([neverRecord]);

    const handler = createGetLinksHandler(strategy);
    const res = await handler(makeRequest(), makeContext());
    const body = JSON.parse(res.body as string);
    expect(body[0].expiry_status).toBe("no_expiry");
    expect(body[0].expired_at).toBeNull();
  });
});
