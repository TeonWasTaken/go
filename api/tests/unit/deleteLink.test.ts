/**
 * Unit tests for the DELETE /api/links/:alias Azure Function handler.
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
  getAliasByPartition: vi.fn(),
  deleteAlias: vi.fn(),
}));

vi.mock("../../src/shared/auth-provider.js", () => ({
  createAuthProvider: vi.fn(),
}));

import { deleteLinkHandler } from "../../src/functions/deleteLink.js";
import { createAuthProvider } from "../../src/shared/auth-provider.js";
import {
  deleteAlias,
  getAliasByPartition,
} from "../../src/shared/cosmos-client.js";

const mockGetAlias = vi.mocked(getAliasByPartition);
const mockDeleteAlias = vi.mocked(deleteAlias);
const mockCreateAuthProvider = vi.mocked(createAuthProvider);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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
    expires_at: new Date(Date.now() + 86400_000 * 365).toISOString(),
    expiry_status: "active",
    expired_at: null,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Auth helper factory
// ---------------------------------------------------------------------------

function makeAuthProvider(
  email: string = "alice@example.com",
  roles: string[] = ["User"],
) {
  return {
    extractIdentity: (headers: Record<string, string>) => {
      const e = headers["x-mock-user-email"] || email;
      const r = (headers["x-mock-user-roles"] || roles.join(","))
        .split(",")
        .map((s: string) => s.trim());
      return { email: e, roles: r };
    },
  };
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
  mockCreateAuthProvider.mockReturnValue(makeAuthProvider());
  mockDeleteAlias.mockResolvedValue(undefined);
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("deleteLink handler", () => {
  it("returns 401 for unauthenticated request", async () => {
    mockCreateAuthProvider.mockReturnValue({
      extractIdentity: () => null,
    });
    const res = await deleteLinkHandler(makeRequest("my-link"), makeContext());
    expect(res.status).toBe(401);
  });

  it("returns 404 when alias not found", async () => {
    mockGetAlias.mockResolvedValue(undefined);
    const res = await deleteLinkHandler(makeRequest("no-exist"), makeContext());
    expect(res.status).toBe(404);
    expect(res.body).toContain("not found");
  });

  it("returns 403 when non-creator non-admin tries to delete global alias", async () => {
    const record = makeAlias({ created_by: "bob@example.com" });
    mockGetAlias.mockImplementation(async (_alias, id) => {
      if (id === "my-link") return record;
      return undefined;
    });

    const res = await deleteLinkHandler(makeRequest("my-link"), makeContext());
    expect(res.status).toBe(403);
  });

  it("returns 403 when admin tries to delete another user's private alias", async () => {
    const record = makeAlias({
      id: "my-link:bob@example.com",
      created_by: "bob@example.com",
      is_private: true,
    });
    mockCreateAuthProvider.mockReturnValue(
      makeAuthProvider("alice@example.com", ["Admin"]),
    );
    mockGetAlias.mockImplementation(async (_alias, id) => {
      if (id === "my-link:alice@example.com") return record;
      return undefined;
    });

    const res = await deleteLinkHandler(makeRequest("my-link"), makeContext());
    expect(res.status).toBe(403);
  });

  it("returns 204 for creator deleting own global alias", async () => {
    const record = makeAlias({ created_by: "alice@example.com" });
    mockGetAlias.mockImplementation(async (_alias, id) => {
      if (id === "my-link") return record;
      return undefined;
    });

    const res = await deleteLinkHandler(makeRequest("my-link"), makeContext());
    expect(res.status).toBe(204);
    expect(mockDeleteAlias).toHaveBeenCalledWith("my-link", "my-link");
  });

  it("returns 204 for admin deleting any global alias", async () => {
    const record = makeAlias({ created_by: "bob@example.com" });
    mockCreateAuthProvider.mockReturnValue(
      makeAuthProvider("alice@example.com", ["Admin"]),
    );
    mockGetAlias.mockImplementation(async (_alias, id) => {
      if (id === "my-link") return record;
      return undefined;
    });

    const res = await deleteLinkHandler(
      makeRequest("my-link", {
        "x-mock-user-email": "alice@example.com",
        "x-mock-user-roles": "Admin",
      }),
      makeContext(),
    );
    expect(res.status).toBe(204);
    expect(mockDeleteAlias).toHaveBeenCalledWith("my-link", "my-link");
  });

  it("returns 204 for creator deleting own private alias", async () => {
    const record = makeAlias({
      id: "my-link:alice@example.com",
      created_by: "alice@example.com",
      is_private: true,
    });
    mockGetAlias.mockImplementation(async (_alias, id) => {
      if (id === "my-link:alice@example.com") return record;
      return undefined;
    });

    const res = await deleteLinkHandler(makeRequest("my-link"), makeContext());
    expect(res.status).toBe(204);
    expect(mockDeleteAlias).toHaveBeenCalledWith(
      "my-link",
      "my-link:alice@example.com",
    );
  });

  it("returns 500 on unexpected error", async () => {
    mockGetAlias.mockRejectedValue(new Error("DB failure"));
    const ctx = makeContext();
    const res = await deleteLinkHandler(makeRequest("my-link"), ctx);
    expect(res.status).toBe(500);
    expect(ctx.error).toHaveBeenCalled();
  });
});
