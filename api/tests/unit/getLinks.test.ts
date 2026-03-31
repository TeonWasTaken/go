/**
 * Unit tests for the GET /api/links Azure Function handler.
 */

import type { HttpRequest, InvocationContext } from "@azure/functions";
import { beforeEach, describe, expect, it, vi } from "vitest";
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

vi.mock("../../src/shared/auth-provider.js", () => ({
  createAuthProvider: vi.fn(),
}));

import { getLinksHandler } from "../../src/functions/getLinks.js";
import { createAuthProvider } from "../../src/shared/auth-provider.js";
import {
  getPopularGlobalAliases,
  listAliasesForUser,
  searchAliases,
} from "../../src/shared/cosmos-client.js";

const mockListAliases = vi.mocked(listAliasesForUser);
const mockSearchAliases = vi.mocked(searchAliases);
const mockGetPopular = vi.mocked(getPopularGlobalAliases);
const mockCreateAuthProvider = vi.mocked(createAuthProvider);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
  mockCreateAuthProvider.mockReturnValue({
    extractIdentity: (headers: Record<string, string>) => ({
      email: headers["x-mock-user-email"] || "alice@example.com",
      roles: (headers["x-mock-user-roles"] || "User").split(","),
    }),
  });
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("getLinks handler", () => {
  it("returns 401 when auth provider returns null", async () => {
    mockCreateAuthProvider.mockReturnValue({
      extractIdentity: () => null,
    });
    const res = await getLinksHandler(makeRequest(), makeContext());
    expect(res.status).toBe(401);
  });

  it("returns aliases from listAliasesForUser by default", async () => {
    const aliases = [makeAlias({ alias: "a" }), makeAlias({ alias: "b" })];
    mockListAliases.mockResolvedValue(aliases);

    const res = await getLinksHandler(makeRequest(), makeContext());
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
    await getLinksHandler(makeRequest({ sort: "clicks" }), makeContext());
    expect(mockListAliases).toHaveBeenCalledWith("alice@example.com", "clicks");
  });

  it("passes sort=heat to listAliasesForUser", async () => {
    mockListAliases.mockResolvedValue([]);
    await getLinksHandler(makeRequest({ sort: "heat" }), makeContext());
    expect(mockListAliases).toHaveBeenCalledWith("alice@example.com", "heat");
  });

  it("uses searchAliases when search param is provided", async () => {
    const aliases = [makeAlias({ alias: "docs", title: "Documentation" })];
    mockSearchAliases.mockResolvedValue(aliases);

    const res = await getLinksHandler(
      makeRequest({ search: "doc" }),
      makeContext(),
    );
    expect(res.status).toBe(200);
    expect(JSON.parse(res.body as string)).toEqual(aliases);
    expect(mockSearchAliases).toHaveBeenCalledWith("alice@example.com", "doc");
    expect(mockListAliases).not.toHaveBeenCalled();
  });

  it("uses getPopularGlobalAliases when scope=popular", async () => {
    const popular = [makeAlias({ alias: "hot", heat_score: 50 })];
    mockGetPopular.mockResolvedValue(popular);

    const res = await getLinksHandler(
      makeRequest({ scope: "popular" }),
      makeContext(),
    );
    expect(res.status).toBe(200);
    expect(JSON.parse(res.body as string)).toEqual(popular);
    expect(mockGetPopular).toHaveBeenCalledWith(10);
    expect(mockListAliases).not.toHaveBeenCalled();
    expect(mockSearchAliases).not.toHaveBeenCalled();
  });

  it("scope=popular takes precedence over search", async () => {
    mockGetPopular.mockResolvedValue([]);
    await getLinksHandler(
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

    const res = await getLinksHandler(makeRequest(), makeContext());
    const body = JSON.parse(res.body as string);
    expect(body[0].click_count).toBe(42);
    expect(body[0].last_accessed_at).toBe("2024-01-15T10:00:00.000Z");
    expect(body[0].heat_score).toBe(7.5);
  });

  it("returns 500 on unexpected error", async () => {
    mockListAliases.mockRejectedValue(new Error("DB failure"));
    const ctx = makeContext();
    const res = await getLinksHandler(makeRequest(), ctx);
    expect(res.status).toBe(500);
    expect(ctx.error).toHaveBeenCalled();
  });
});
