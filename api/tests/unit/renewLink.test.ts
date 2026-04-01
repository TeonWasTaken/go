/**
 * Unit tests for the PUT /api/links/:alias/renew Azure Function handler.
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
  getAliasByPartition: vi.fn(),
  updateAlias: vi.fn(),
}));

import { createRenewLinkHandler } from "../../src/functions/renewLink.js";
import {
  getAliasByPartition,
  updateAlias,
} from "../../src/shared/cosmos-client.js";

const mockGetAlias = vi.mocked(getAliasByPartition);
const mockUpdateAlias = vi.mocked(updateAlias);

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

function makeRequest(
  alias: string,
  headerOverrides: Record<string, string> = {},
): HttpRequest {
  const headers = new Headers({
    "x-mock-user-email": "alice@example.com",
    "x-mock-user-roles": "User",
    ...headerOverrides,
  });
  return {
    url: `https://go.example.com/api/links/${alias}/renew`,
    headers,
    method: "PUT",
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
    id: "my-link",
    alias: "my-link",
    destination_url: "https://example.com/page",
    created_by: "alice@example.com",
    title: "My Link",
    click_count: 5,
    heat_score: 2.0,
    heat_updated_at: new Date().toISOString(),
    is_private: false,
    created_at: new Date().toISOString(),
    last_accessed_at: null,
    expiry_policy_type: "fixed",
    duration_months: 12,
    custom_expires_at: null,
    expires_at: new Date(Date.now() - 86400_000).toISOString(), // expired yesterday
    expiry_status: "expired",
    expired_at: new Date(Date.now() - 86400_000).toISOString(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

let strategy: AuthStrategy;

beforeEach(() => {
  vi.clearAllMocks();
  strategy = makeMockStrategy();
  mockUpdateAlias.mockImplementation(async (record) => record);
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("renewLink handler", () => {
  it("returns 401 when strategy returns null identity", async () => {
    strategy = makeMockStrategy({ extractIdentity: () => null });
    const handler = createRenewLinkHandler(strategy);
    const res = await handler(makeRequest("my-link"), makeContext());
    expect(res.status).toBe(401);
  });

  it("returns 404 when alias not found", async () => {
    mockGetAlias.mockResolvedValue(undefined);
    const handler = createRenewLinkHandler(strategy);
    const res = await handler(makeRequest("no-exist"), makeContext());
    expect(res.status).toBe(404);
    expect(res.body).toContain("not found");
  });

  it("returns 403 when non-creator non-admin tries to renew", async () => {
    const record = makeAlias({ created_by: "bob@example.com" });
    mockGetAlias.mockImplementation(async (_alias, id) => {
      if (id === "my-link") return record;
      return undefined;
    });

    const handler = createRenewLinkHandler(strategy);
    const res = await handler(makeRequest("my-link"), makeContext());
    expect(res.status).toBe(403);
  });

  it("returns 403 when admin tries to renew another user's private alias", async () => {
    const record = makeAlias({
      id: "my-link:bob@example.com",
      created_by: "bob@example.com",
      is_private: true,
    });
    strategy = makeMockStrategy({
      extractIdentity: () => ({
        email: "alice@example.com",
        roles: ["Admin"],
      }),
    });
    mockGetAlias.mockImplementation(async (_alias, id) => {
      if (id === "my-link:alice@example.com") return record;
      return undefined;
    });

    const handler = createRenewLinkHandler(strategy);
    const res = await handler(makeRequest("my-link"), makeContext());
    expect(res.status).toBe(403);
  });

  it("returns 200 for creator renewing own expired alias (resets status and clears expired_at)", async () => {
    const record = makeAlias({
      created_by: "alice@example.com",
      expiry_policy_type: "fixed",
      duration_months: 12,
      expiry_status: "expired",
      expired_at: new Date(Date.now() - 86400_000).toISOString(),
    });
    mockGetAlias.mockImplementation(async (_alias, id) => {
      if (id === "my-link") return record;
      return undefined;
    });

    const handler = createRenewLinkHandler(strategy);
    const res = await handler(makeRequest("my-link"), makeContext());
    expect(res.status).toBe(200);
    const body = JSON.parse(res.body as string);
    expect(body.expiry_status).toBe("active");
    expect(body.expired_at).toBeNull();
    expect(body.expires_at).toBeTruthy();
  });

  it("returns 200 for admin renewing any global alias", async () => {
    const record = makeAlias({
      created_by: "bob@example.com",
      expiry_status: "expired",
      expired_at: new Date(Date.now() - 86400_000).toISOString(),
    });
    strategy = makeMockStrategy({
      extractIdentity: () => ({
        email: "alice@example.com",
        roles: ["Admin"],
      }),
    });
    mockGetAlias.mockImplementation(async (_alias, id) => {
      if (id === "my-link") return record;
      return undefined;
    });

    const handler = createRenewLinkHandler(strategy);
    const res = await handler(
      makeRequest("my-link", {
        "x-mock-user-email": "alice@example.com",
        "x-mock-user-roles": "Admin",
      }),
      makeContext(),
    );
    expect(res.status).toBe(200);
    const body = JSON.parse(res.body as string);
    expect(body.expiry_status).toBe("active");
    expect(body.expired_at).toBeNull();
  });

  it("correctly recalculates expiry for fixed policy with duration_months", async () => {
    const record = makeAlias({
      created_by: "alice@example.com",
      expiry_policy_type: "fixed",
      duration_months: 3,
      expiry_status: "expired",
      expired_at: new Date(Date.now() - 86400_000).toISOString(),
    });
    mockGetAlias.mockImplementation(async (_alias, id) => {
      if (id === "my-link") return record;
      return undefined;
    });

    const handler = createRenewLinkHandler(strategy);
    const before = Date.now();
    const res = await handler(makeRequest("my-link"), makeContext());
    expect(res.status).toBe(200);
    const body = JSON.parse(res.body as string);

    // expires_at should be roughly 3 months from now
    const expiresAt = new Date(body.expires_at).getTime();
    const threeMonthsMs = 3 * 30 * 86400_000;
    expect(expiresAt).toBeGreaterThan(before + threeMonthsMs - 86400_000 * 5);
    expect(expiresAt).toBeLessThan(before + threeMonthsMs + 86400_000 * 5);
    expect(body.expiry_status).toBe("active");
  });

  it("correctly recalculates expiry for inactivity policy", async () => {
    const record = makeAlias({
      created_by: "alice@example.com",
      expiry_policy_type: "inactivity",
      duration_months: null,
      expiry_status: "expired",
      expired_at: new Date(Date.now() - 86400_000).toISOString(),
    });
    mockGetAlias.mockImplementation(async (_alias, id) => {
      if (id === "my-link") return record;
      return undefined;
    });

    const handler = createRenewLinkHandler(strategy);
    const before = Date.now();
    const res = await handler(makeRequest("my-link"), makeContext());
    expect(res.status).toBe(200);
    const body = JSON.parse(res.body as string);

    // expires_at should be roughly 12 months from now
    const expiresAt = new Date(body.expires_at).getTime();
    const twelveMonthsMs = 12 * 30 * 86400_000;
    expect(expiresAt).toBeGreaterThan(before + twelveMonthsMs - 86400_000 * 10);
    expect(expiresAt).toBeLessThan(before + twelveMonthsMs + 86400_000 * 10);
    expect(body.expiry_status).toBe("active");
  });

  it("returns 500 on unexpected error", async () => {
    mockGetAlias.mockRejectedValue(new Error("DB failure"));
    const handler = createRenewLinkHandler(strategy);
    const ctx = makeContext();
    const res = await handler(makeRequest("my-link"), ctx);
    expect(res.status).toBe(500);
    expect(ctx.error).toHaveBeenCalled();
  });
});
