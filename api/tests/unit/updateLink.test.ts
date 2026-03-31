/**
 * Unit tests for the PUT /api/links/:alias Azure Function handler.
 */

import type { HttpRequest, InvocationContext } from "@azure/functions";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  AliasRecord,
  UpdateAliasRequest,
} from "../../src/shared/models.js";

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

vi.mock("../../src/shared/auth-provider.js", () => ({
  createAuthProvider: vi.fn(),
}));

import { updateLinkHandler } from "../../src/functions/updateLink.js";
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
  body: Partial<UpdateAliasRequest> = {},
  headerOverrides: Record<string, string> = {},
): HttpRequest {
  const defaultBody: UpdateAliasRequest = {
    destination_url: "https://example.com/updated",
    ...body,
  };
  const headers = new Headers({
    "x-mock-user-email": "alice@example.com",
    "x-mock-user-roles": "User",
    "content-type": "application/json",
    ...headerOverrides,
  });
  return {
    url: `https://go.example.com/api/links/${alias}`,
    headers,
    method: "PUT",
    params: { alias },
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
  mockUpdateAlias.mockImplementation(async (record) => record);
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("updateLink handler", () => {
  it("returns 401 for unauthenticated request", async () => {
    mockCreateAuthProvider.mockReturnValue({
      extractIdentity: () => null,
    });
    const res = await updateLinkHandler(makeRequest("my-link"), makeContext());
    expect(res.status).toBe(401);
  });

  it("returns 404 when alias not found", async () => {
    mockGetAlias.mockResolvedValue(undefined);
    const res = await updateLinkHandler(makeRequest("no-exist"), makeContext());
    expect(res.status).toBe(404);
    expect(res.body).toContain("not found");
  });

  it("returns 403 when non-creator non-admin tries to update global alias", async () => {
    // bob created the alias, alice (User) tries to update
    const record = makeAlias({ created_by: "bob@example.com" });
    mockGetAlias.mockImplementation(async (_alias, id) => {
      // private lookup returns undefined, global lookup returns the record
      if (id === "my-link") return record;
      return undefined;
    });

    const res = await updateLinkHandler(makeRequest("my-link"), makeContext());
    expect(res.status).toBe(403);
  });

  it("returns 403 when admin tries to update another user's private alias", async () => {
    // bob's private alias
    const record = makeAlias({
      id: "my-link:bob@example.com",
      created_by: "bob@example.com",
      is_private: true,
    });
    // Admin alice tries to update — but the private lookup is scoped to alice,
    // so she wouldn't find bob's private alias via the normal lookup.
    // However, as a safety check, if somehow the record is found:
    mockCreateAuthProvider.mockReturnValue(
      makeAuthProvider("alice@example.com", ["Admin"]),
    );
    mockGetAlias.mockImplementation(async (_alias, id) => {
      // Simulate: alice's private lookup returns bob's record (safety check scenario)
      if (id === "my-link:alice@example.com") return record;
      return undefined;
    });

    const res = await updateLinkHandler(makeRequest("my-link"), makeContext());
    expect(res.status).toBe(403);
  });

  it("returns 200 for creator updating own global alias", async () => {
    const record = makeAlias({ created_by: "alice@example.com" });
    mockGetAlias.mockImplementation(async (_alias, id) => {
      if (id === "my-link") return record;
      return undefined;
    });

    const res = await updateLinkHandler(
      makeRequest("my-link", { destination_url: "https://example.com/new" }),
      makeContext(),
    );
    expect(res.status).toBe(200);
    const body = JSON.parse(res.body as string);
    expect(body.destination_url).toBe("https://example.com/new");
  });

  it("returns 200 for admin updating any global alias", async () => {
    const record = makeAlias({ created_by: "bob@example.com" });
    mockCreateAuthProvider.mockReturnValue(
      makeAuthProvider("alice@example.com", ["Admin"]),
    );
    mockGetAlias.mockImplementation(async (_alias, id) => {
      if (id === "my-link") return record;
      return undefined;
    });

    const res = await updateLinkHandler(
      makeRequest(
        "my-link",
        { title: "Updated Title" },
        {
          "x-mock-user-email": "alice@example.com",
          "x-mock-user-roles": "Admin",
        },
      ),
      makeContext(),
    );
    expect(res.status).toBe(200);
    const body = JSON.parse(res.body as string);
    expect(body.title).toBe("Updated Title");
  });

  it("returns 200 for creator updating own private alias", async () => {
    const record = makeAlias({
      id: "my-link:alice@example.com",
      created_by: "alice@example.com",
      is_private: true,
    });
    mockGetAlias.mockImplementation(async (_alias, id) => {
      if (id === "my-link:alice@example.com") return record;
      return undefined;
    });

    const res = await updateLinkHandler(
      makeRequest("my-link", {
        destination_url: "https://example.com/private-new",
      }),
      makeContext(),
    );
    expect(res.status).toBe(200);
    const body = JSON.parse(res.body as string);
    expect(body.destination_url).toBe("https://example.com/private-new");
    expect(body.is_private).toBe(true);
  });

  it("recalculates expiry on policy change", async () => {
    const record = makeAlias({
      created_by: "alice@example.com",
      expiry_policy_type: "fixed",
      duration_months: 12,
      expiry_status: "expiring_soon",
    });
    mockGetAlias.mockImplementation(async (_alias, id) => {
      if (id === "my-link") return record;
      return undefined;
    });

    const res = await updateLinkHandler(
      makeRequest("my-link", { expiry_policy_type: "never" }),
      makeContext(),
    );
    expect(res.status).toBe(200);
    const body = JSON.parse(res.body as string);
    expect(body.expiry_policy_type).toBe("never");
    expect(body.expires_at).toBeNull();
    expect(body.expiry_status).toBe("no_expiry");
  });

  it("resets expiry_status to active on policy change to fixed", async () => {
    const record = makeAlias({
      created_by: "alice@example.com",
      expiry_policy_type: "never",
      expiry_status: "no_expiry",
      expires_at: null,
    });
    mockGetAlias.mockImplementation(async (_alias, id) => {
      if (id === "my-link") return record;
      return undefined;
    });

    const res = await updateLinkHandler(
      makeRequest("my-link", {
        expiry_policy_type: "fixed",
        duration_months: 3,
      }),
      makeContext(),
    );
    expect(res.status).toBe(200);
    const body = JSON.parse(res.body as string);
    expect(body.expiry_policy_type).toBe("fixed");
    expect(body.duration_months).toBe(3);
    expect(body.expires_at).toBeTruthy();
    expect(body.expiry_status).toBe("active");
  });

  it("returns 400 for invalid destination URL", async () => {
    const record = makeAlias({ created_by: "alice@example.com" });
    mockGetAlias.mockImplementation(async (_alias, id) => {
      if (id === "my-link") return record;
      return undefined;
    });

    const res = await updateLinkHandler(
      makeRequest("my-link", { destination_url: "not-a-url" }),
      makeContext(),
    );
    expect(res.status).toBe(400);
    expect(res.body).toContain("URL");
  });

  it("returns 500 on unexpected error", async () => {
    mockGetAlias.mockRejectedValue(new Error("DB failure"));
    const ctx = makeContext();
    const res = await updateLinkHandler(makeRequest("my-link"), ctx);
    expect(res.status).toBe(500);
    expect(ctx.error).toHaveBeenCalled();
  });
});
