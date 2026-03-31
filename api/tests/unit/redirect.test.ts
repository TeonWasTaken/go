/**
 * Unit tests for the redirect Azure Function handler.
 */

import type { HttpRequest, InvocationContext } from "@azure/functions";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AliasRecord } from "../../src/shared/models.js";

// ---------------------------------------------------------------------------
// Mocks — must be before any imports that trigger side effects
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
// Helpers
// ---------------------------------------------------------------------------

function makeRequest(
  alias: string,
  opts?: { headers?: Record<string, string>; query?: string },
): HttpRequest {
  const url = `https://go.example.com/${alias}${opts?.query ?? ""}`;
  const headersInit: Record<string, string> = {
    "x-mock-user-email": "alice@example.com",
    "x-mock-user-roles": "User",
    ...(opts?.headers ?? {}),
  };
  const headers = new Headers(headersInit);
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

function makeAlias(overrides: Partial<AliasRecord> = {}): AliasRecord {
  return {
    id: "test",
    alias: "test",
    destination_url: "https://example.com/destination",
    created_by: "alice@example.com",
    title: "Test Alias",
    click_count: 5,
    heat_score: 2.0,
    heat_updated_at: new Date(Date.now() - 3600_000).toISOString(),
    is_private: false,
    created_at: new Date(Date.now() - 86400_000 * 30).toISOString(),
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
  mockUpdateAlias.mockResolvedValue(undefined as any);
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("redirect handler", () => {
  it("returns 401 when auth provider returns null", async () => {
    mockCreateAuthProvider.mockReturnValue({
      extractIdentity: () => null,
    });
    const res = await redirectHandler(makeRequest("test"), makeContext());
    expect(res.status).toBe(401);
  });

  it("redirects to dashboard with suggest param when alias not found", async () => {
    mockGetAlias.mockResolvedValue(undefined);
    const res = await redirectHandler(makeRequest("unknown"), makeContext());
    expect(res.status).toBe(302);
    expect(res.headers).toHaveProperty("location");
    const location = (res.headers as Record<string, string>).location;
    expect(location).toContain("suggest=unknown");
  });

  it("302 redirects to global alias destination when only global exists", async () => {
    const global = makeAlias({ id: "docs", alias: "docs", is_private: false });
    mockGetAlias.mockImplementation(async (_alias, id) => {
      if (id === "docs") return global;
      return undefined;
    });
    const res = await redirectHandler(makeRequest("docs"), makeContext());
    expect(res.status).toBe(302);
    expect((res.headers as any).location).toBe(
      "https://example.com/destination",
    );
  });

  it("302 redirects to private alias destination when only private exists", async () => {
    const priv = makeAlias({
      id: "docs:alice@example.com",
      alias: "docs",
      is_private: true,
      destination_url: "https://private.example.com",
    });
    mockGetAlias.mockImplementation(async (_alias, id) => {
      if (id === "docs:alice@example.com") return priv;
      return undefined;
    });
    const res = await redirectHandler(makeRequest("docs"), makeContext());
    expect(res.status).toBe(302);
    expect((res.headers as any).location).toBe("https://private.example.com/");
  });

  it("returns interstitial HTML when both private and global exist", async () => {
    const priv = makeAlias({
      id: "docs:alice@example.com",
      alias: "docs",
      is_private: true,
      destination_url: "https://private.example.com",
    });
    const global = makeAlias({
      id: "docs",
      alias: "docs",
      is_private: false,
      destination_url: "https://global.example.com",
    });
    mockGetAlias.mockImplementation(async (_alias, id) => {
      if (id === "docs:alice@example.com") return priv;
      if (id === "docs") return global;
      return undefined;
    });
    const res = await redirectHandler(makeRequest("docs"), makeContext());
    expect(res.status).toBe(200);
    expect((res.headers as any)["content-type"]).toContain("text/html");
    expect(res.body).toContain("private.example.com");
    expect(res.body).toContain("global.example.com");
  });

  it("normalizes alias to lowercase", async () => {
    mockGetAlias.mockResolvedValue(undefined);
    await redirectHandler(makeRequest("MyAlias"), makeContext());
    expect(mockGetAlias).toHaveBeenCalledWith(
      "myalias",
      "myalias:alice@example.com",
    );
    expect(mockGetAlias).toHaveBeenCalledWith("myalias", "myalias");
  });

  it("increments click_count and updates analytics on redirect", async () => {
    const record = makeAlias({ click_count: 10 });
    mockGetAlias.mockImplementation(async (_alias, id) => {
      if (id === "test") return record;
      return undefined;
    });
    await redirectHandler(makeRequest("test"), makeContext());
    expect(mockUpdateAlias).toHaveBeenCalledTimes(1);
    const updated = mockUpdateAlias.mock.calls[0][0];
    expect(updated.click_count).toBe(11);
    expect(updated.last_accessed_at).toBeTruthy();
    expect(updated.heat_score).toBeGreaterThan(0);
  });

  it("redirects to dashboard with expired param when alias is expired", async () => {
    const expired = makeAlias({ expiry_status: "expired" });
    mockGetAlias.mockImplementation(async (_alias, id) => {
      if (id === "test") return expired;
      return undefined;
    });
    const res = await redirectHandler(makeRequest("test"), makeContext());
    expect(res.status).toBe(302);
    expect((res.headers as any).location).toContain("expired=test");
  });

  it("resets expires_at for inactivity policy on access", async () => {
    const record = makeAlias({
      expiry_policy_type: "inactivity",
      expires_at: new Date(Date.now() + 86400_000 * 30).toISOString(),
    });
    mockGetAlias.mockImplementation(async (_alias, id) => {
      if (id === "test") return record;
      return undefined;
    });
    await redirectHandler(makeRequest("test"), makeContext());
    const updated = mockUpdateAlias.mock.calls[0][0];
    const newExpiry = new Date(updated.expires_at!);
    // Should be approximately 12 months from now
    const elevenMonths = Date.now() + 86400_000 * 330;
    expect(newExpiry.getTime()).toBeGreaterThan(elevenMonths);
  });

  it("merges query params with destination URL", async () => {
    const record = makeAlias({
      destination_url: "https://example.com/page?existing=1",
    });
    mockGetAlias.mockImplementation(async (_alias, id) => {
      if (id === "test") return record;
      return undefined;
    });
    const res = await redirectHandler(
      makeRequest("test", { query: "?extra=2" }),
      makeContext(),
    );
    expect(res.status).toBe(302);
    const loc = (res.headers as any).location;
    expect(loc).toContain("existing=1");
    expect(loc).toContain("extra=2");
  });

  it("returns 500 on database error during lookup", async () => {
    mockGetAlias.mockRejectedValue(new Error("DB connection failed"));
    const ctx = makeContext();
    const res = await redirectHandler(makeRequest("test"), ctx);
    expect(res.status).toBe(500);
    expect(ctx.error).toHaveBeenCalled();
  });

  it("still redirects even if analytics update fails", async () => {
    const record = makeAlias();
    mockGetAlias.mockImplementation(async (_alias, id) => {
      if (id === "test") return record;
      return undefined;
    });
    mockUpdateAlias.mockRejectedValue(new Error("write failed"));
    const ctx = makeContext();
    const res = await redirectHandler(makeRequest("test"), ctx);
    expect(res.status).toBe(302);
    expect(ctx.error).toHaveBeenCalled();
  });

  it("redirects to / when alias param is empty", async () => {
    const req = {
      url: "https://go.example.com/",
      params: { alias: "" },
      headers: new Headers({ "x-mock-user-email": "alice@example.com" }),
      method: "GET",
    } as unknown as HttpRequest;
    const res = await redirectHandler(req, makeContext());
    expect(res.status).toBe(302);
    expect((res.headers as any).location).toBe("/");
  });
});
