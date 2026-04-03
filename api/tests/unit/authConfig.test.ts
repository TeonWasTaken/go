/**
 * Unit tests for the GET /api/auth-config Azure Function handler.
 */

import type { HttpRequest, InvocationContext } from "@azure/functions";
import { describe, expect, it, vi } from "vitest";
import type { AuthStrategy } from "../../src/shared/auth-strategy.js";

vi.mock("@azure/functions", () => ({
  app: { http: vi.fn() },
}));

import { createAuthConfigHandler } from "../../src/functions/authConfig.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeMockStrategy(overrides: Partial<AuthStrategy> = {}): AuthStrategy {
  return {
    mode: "dev",
    redirectRequiresAuth: false,
    identityProviders: ["dev"],
    extractIdentity: () => ({ email: "dev@localhost", roles: ["User"] }),
    ...overrides,
  };
}

function makeRequest(): HttpRequest {
  return {
    url: "https://go.example.com/api/auth-config",
    headers: new Headers(),
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

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("GET /api/auth-config", () => {
  it("returns mode, identityProviders, and loginUrl for dev strategy", async () => {
    const strategy = makeMockStrategy();
    const handler = createAuthConfigHandler(strategy);
    const res = await handler(makeRequest(), makeContext());

    expect(res.status).toBe(200);
    const body = JSON.parse(res.body as string);
    expect(body).toEqual({
      mode: "dev",
      identityProviders: ["dev"],
      loginUrl: "/.auth/login/dev",
      aliasPrefix: "go",
      allowPublicCreate: true,
      devUser: { email: "dev@localhost", roles: ["User"] },
    });
  });

  it("returns corporate config with AAD login URL", async () => {
    const strategy = makeMockStrategy({
      mode: "corporate",
      redirectRequiresAuth: true,
      identityProviders: ["aad"],
    });
    const handler = createAuthConfigHandler(strategy);
    const res = await handler(makeRequest(), makeContext());

    expect(res.status).toBe(200);
    const body = JSON.parse(res.body as string);
    expect(body).toEqual({
      mode: "corporate",
      identityProviders: ["aad"],
      loginUrl: "/.auth/login/aad",
      aliasPrefix: "go",
      allowPublicCreate: true,
    });
  });

  it("returns public config with primary provider login URL", async () => {
    const strategy = makeMockStrategy({
      mode: "public",
      redirectRequiresAuth: false,
      identityProviders: ["google", "github"],
    });
    const handler = createAuthConfigHandler(strategy);
    const res = await handler(makeRequest(), makeContext());

    expect(res.status).toBe(200);
    const body = JSON.parse(res.body as string);
    expect(body).toEqual({
      mode: "public",
      identityProviders: ["google", "github"],
      loginUrl: "/.auth/login/google",
      aliasPrefix: "go",
      allowPublicCreate: true,
    });
  });

  it("sets content-type and cache-control headers", async () => {
    const handler = createAuthConfigHandler(makeMockStrategy());
    const res = await handler(makeRequest(), makeContext());

    expect(res.headers).toEqual({
      "content-type": "application/json",
      "cache-control": "public, max-age=300",
    });
  });

  it("CP-5: returns Cache-Control header with default max-age=300 when env var is not set", async () => {
    delete process.env.CACHE_MAX_AGE_AUTH_CONFIG;

    const handler = createAuthConfigHandler(makeMockStrategy());
    const res = await handler(makeRequest(), makeContext());

    expect(res.headers).toBeDefined();
    const headers = res.headers as Record<string, string>;
    expect(headers["cache-control"]).toBe("public, max-age=300");
  });

  it("CP-11: uses custom CACHE_MAX_AGE_AUTH_CONFIG in Cache-Control header", async () => {
    process.env.CACHE_MAX_AGE_AUTH_CONFIG = "600";

    const handler = createAuthConfigHandler(makeMockStrategy());
    const res = await handler(makeRequest(), makeContext());

    const headers = res.headers as Record<string, string>;
    expect(headers["cache-control"]).toBe("public, max-age=600");

    delete process.env.CACHE_MAX_AGE_AUTH_CONFIG;
  });

  it("falls back to aad when identityProviders is empty", async () => {
    const strategy = makeMockStrategy({ identityProviders: [] });
    const handler = createAuthConfigHandler(strategy);
    const res = await handler(makeRequest(), makeContext());

    const body = JSON.parse(res.body as string);
    expect(body.loginUrl).toBe("/.auth/login/aad");
  });
});
