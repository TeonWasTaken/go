/**
 * Unit tests for the POST /api/links Azure Function handler.
 */

import type { HttpRequest, InvocationContext } from "@azure/functions";
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

vi.mock("../../src/shared/auth-provider.js", () => ({
  createAuthProvider: vi.fn(),
}));

import { createLinkHandler } from "../../src/functions/createLink.js";
import { createAuthProvider } from "../../src/shared/auth-provider.js";
import {
  createAlias,
  getAliasByPartition,
} from "../../src/shared/cosmos-client.js";

const mockCreateAlias = vi.mocked(createAlias);
const mockGetAlias = vi.mocked(getAliasByPartition);
const mockCreateAuthProvider = vi.mocked(createAuthProvider);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRequest(body: Partial<CreateAliasRequest> = {}): HttpRequest {
  const defaultBody: CreateAliasRequest = {
    alias: "my-link",
    destination_url: "https://example.com/page",
    title: "My Link",
    ...body,
  };
  const headers = new Headers({
    "x-mock-user-email": "alice@example.com",
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

function makeAlias(overrides: Partial<AliasRecord> = {}): AliasRecord {
  return {
    id: "my-link",
    alias: "my-link",
    destination_url: "https://example.com/page",
    created_by: "alice@example.com",
    title: "My Link",
    click_count: 0,
    heat_score: 0,
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
  mockGetAlias.mockResolvedValue(undefined);
  mockCreateAlias.mockImplementation(async (record) => record);
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("createLink handler", () => {
  it("returns 401 when auth provider returns null", async () => {
    mockCreateAuthProvider.mockReturnValue({
      extractIdentity: () => null,
    });
    const res = await createLinkHandler(makeRequest(), makeContext());
    expect(res.status).toBe(401);
  });

  it("returns 400 for invalid alias format", async () => {
    const res = await createLinkHandler(
      makeRequest({ alias: "INVALID ALIAS!" }),
      makeContext(),
    );
    expect(res.status).toBe(400);
    expect(res.body).toContain("lowercase alphanumeric");
  });

  it("returns 400 for invalid destination URL", async () => {
    const res = await createLinkHandler(
      makeRequest({ destination_url: "not-a-url" }),
      makeContext(),
    );
    expect(res.status).toBe(400);
    expect(res.body).toContain("URL");
  });

  it("returns 400 for invalid expiry policy", async () => {
    const res = await createLinkHandler(
      makeRequest({ expiry_policy_type: "bogus" as any }),
      makeContext(),
    );
    expect(res.status).toBe(400);
    expect(res.body).toContain("Expiry policy type");
  });

  it("returns 409 for global alias conflict", async () => {
    mockGetAlias.mockResolvedValue(makeAlias());
    const res = await createLinkHandler(makeRequest(), makeContext());
    expect(res.status).toBe(409);
    expect(res.body).toContain("already exists");
  });

  it("returns 201 for successful creation with defaults", async () => {
    const res = await createLinkHandler(makeRequest(), makeContext());
    expect(res.status).toBe(201);
    expect(res.headers).toHaveProperty("content-type", "application/json");

    const body = JSON.parse(res.body as string);
    expect(body.alias).toBe("my-link");
    expect(body.destination_url).toBe("https://example.com/page");
    expect(body.created_by).toBe("alice@example.com");
    expect(body.click_count).toBe(0);
    expect(body.heat_score).toBe(0);
    expect(body.heat_updated_at).toBeNull();
    expect(body.last_accessed_at).toBeNull();
    expect(body.expired_at).toBeNull();
    expect(body.is_private).toBe(false);
    expect(body.id).toBe("my-link");
    // Default expiry: fixed with 12 months
    expect(body.expiry_policy_type).toBe("fixed");
    expect(body.duration_months).toBe(12);
    expect(body.expires_at).toBeTruthy();
    expect(body.expiry_status).toBe("active");
  });

  it("returns 201 for private alias creation (checks private conflict)", async () => {
    // No existing private alias — creation should succeed
    mockGetAlias.mockResolvedValue(undefined);
    const res = await createLinkHandler(
      makeRequest({ is_private: true }),
      makeContext(),
    );
    expect(res.status).toBe(201);
    const body = JSON.parse(res.body as string);
    expect(body.is_private).toBe(true);
    expect(body.id).toBe("my-link:alice@example.com");
    // getAliasByPartition should have been called to check for private conflict
    expect(mockGetAlias).toHaveBeenCalledWith(
      "my-link",
      "my-link:alice@example.com",
    );
  });

  it("computes expiry correctly for never policy", async () => {
    const res = await createLinkHandler(
      makeRequest({ expiry_policy_type: "never" }),
      makeContext(),
    );
    expect(res.status).toBe(201);
    const body = JSON.parse(res.body as string);
    expect(body.expiry_policy_type).toBe("never");
    expect(body.expires_at).toBeNull();
    expect(body.expiry_status).toBe("no_expiry");
    expect(body.duration_months).toBeNull();
  });

  it("computes expiry correctly for inactivity policy", async () => {
    const res = await createLinkHandler(
      makeRequest({ expiry_policy_type: "inactivity" }),
      makeContext(),
    );
    expect(res.status).toBe(201);
    const body = JSON.parse(res.body as string);
    expect(body.expiry_policy_type).toBe("inactivity");
    expect(body.expires_at).toBeTruthy();
    expect(body.expiry_status).toBe("active");
    // expires_at should be ~12 months from now
    const expiresAt = new Date(body.expires_at).getTime();
    const elevenMonths = Date.now() + 86400_000 * 330;
    expect(expiresAt).toBeGreaterThan(elevenMonths);
  });

  it("computes expiry correctly for fixed policy with duration_months", async () => {
    const res = await createLinkHandler(
      makeRequest({ expiry_policy_type: "fixed", duration_months: 3 }),
      makeContext(),
    );
    expect(res.status).toBe(201);
    const body = JSON.parse(res.body as string);
    expect(body.expiry_policy_type).toBe("fixed");
    expect(body.duration_months).toBe(3);
    expect(body.expires_at).toBeTruthy();
    // expires_at should be ~3 months from now
    const expiresAt = new Date(body.expires_at).getTime();
    const twoMonths = Date.now() + 86400_000 * 60;
    const fourMonths = Date.now() + 86400_000 * 125;
    expect(expiresAt).toBeGreaterThan(twoMonths);
    expect(expiresAt).toBeLessThan(fourMonths);
  });

  it("computes expiry correctly for fixed policy with custom_expires_at", async () => {
    const futureDate = new Date(Date.now() + 86400_000 * 180).toISOString();
    const res = await createLinkHandler(
      makeRequest({
        expiry_policy_type: "fixed",
        custom_expires_at: futureDate,
      }),
      makeContext(),
    );
    expect(res.status).toBe(201);
    const body = JSON.parse(res.body as string);
    expect(body.expiry_policy_type).toBe("fixed");
    expect(body.expires_at).toBe(futureDate);
    expect(body.custom_expires_at).toBe(futureDate);
  });

  it("normalizes alias to lowercase", async () => {
    const res = await createLinkHandler(
      makeRequest({ alias: "My-Link" }),
      makeContext(),
    );
    expect(res.status).toBe(201);
    const body = JSON.parse(res.body as string);
    expect(body.alias).toBe("my-link");
  });

  it("returns 500 on unexpected error", async () => {
    mockCreateAlias.mockRejectedValue(new Error("DB failure"));
    const ctx = makeContext();
    const res = await createLinkHandler(makeRequest(), ctx);
    expect(res.status).toBe(500);
    expect(ctx.error).toHaveBeenCalled();
  });
});
