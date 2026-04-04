import { describe, expect, it } from "vitest";
import {
    generateSwaConfig,
    parseProviders,
} from "../../../scripts/generate-swa-config.js";

// ── Helper to find a route by path ──────────────────────────────────

function findRoute(
  config: ReturnType<typeof generateSwaConfig>,
  routePath: string,
) {
  return config.routes.find((r) => r.route === routePath);
}

function blockedRoutes(config: ReturnType<typeof generateSwaConfig>) {
  return config.routes
    .filter((r) => r.statusCode === 404)
    .map((r) => r.route.replace("/.auth/login/", ""));
}

// ── Corporate mode ──────────────────────────────────────────────────

describe("generateSwaConfig — corporate", () => {
  const config = generateSwaConfig("corporate");

  it("includes AAD auth identity provider config", () => {
    expect(config.auth?.identityProviders?.azureActiveDirectory).toBeDefined();
  });

  it("blocks github, twitter, and google providers", () => {
    const blocked = blockedRoutes(config);
    expect(blocked).toContain("github");
    expect(blocked).toContain("twitter");
    expect(blocked).toContain("google");
  });

  it("does NOT block aad", () => {
    const blocked = blockedRoutes(config);
    expect(blocked).not.toContain("aad");
  });

  it("requires authenticated role on /api/*", () => {
    const route = findRoute(config, "/api/*");
    expect(route?.allowedRoles).toEqual(["authenticated"]);
  });

  it("requires authenticated role on /* catch-all", () => {
    const route = findRoute(config, "/*");
    expect(route?.allowedRoles).toEqual(["authenticated"]);
  });

  it("redirects 401 to AAD login", () => {
    expect(config.responseOverrides["401"].redirect).toContain(
      "/.auth/login/aad",
    );
    expect(config.responseOverrides["401"].statusCode).toBe(302);
  });

  it("includes navigationFallback", () => {
    expect(config.navigationFallback.rewrite).toBe("/index.html");
    expect(config.navigationFallback.exclude).toContain("/api/*");
    expect(config.navigationFallback.exclude).toContain("/_/*");
  });

  it("includes platform config", () => {
    expect(config.platform.apiRuntime).toBe("node:18");
  });

  it("has /{alias} rewrite without allowedRoles", () => {
    const route = findRoute(config, "/{alias}");
    expect(route?.rewrite).toBe("/api/redirect/{alias}");
    expect(route?.allowedRoles).toBeUndefined();
  });
});

// ── Public mode ─────────────────────────────────────────────────────

describe("generateSwaConfig — public", () => {
  it("blocks providers not in the list", () => {
    const config = generateSwaConfig("public", ["google"]);
    const blocked = blockedRoutes(config);
    expect(blocked).toContain("aad");
    expect(blocked).toContain("github");
    expect(blocked).toContain("twitter");
    expect(blocked).not.toContain("google");
  });

  it("enables multiple providers", () => {
    const config = generateSwaConfig("public", ["google", "github"]);
    const blocked = blockedRoutes(config);
    expect(blocked).not.toContain("google");
    expect(blocked).not.toContain("github");
    expect(blocked).toContain("aad");
    expect(blocked).toContain("twitter");
  });

  it("redirects 401 to primary provider", () => {
    const config = generateSwaConfig("public", ["github", "google"]);
    expect(config.responseOverrides["401"].redirect).toContain(
      "/.auth/login/github",
    );
  });

  it("requires authenticated on /api/*", () => {
    const config = generateSwaConfig("public", ["google"]);
    const route = findRoute(config, "/api/*");
    expect(route?.allowedRoles).toEqual(["authenticated"]);
  });

  it("leaves /{alias} open (no allowedRoles)", () => {
    const config = generateSwaConfig("public", ["google"]);
    const route = findRoute(config, "/{alias}");
    expect(route?.rewrite).toBe("/api/redirect/{alias}");
    expect(route?.allowedRoles).toBeUndefined();
  });

  it("includes AAD auth config when aad is in providers", () => {
    const config = generateSwaConfig("public", ["aad"]);
    expect(config.auth?.identityProviders?.azureActiveDirectory).toBeDefined();
  });

  it("omits AAD auth config when aad is not in providers", () => {
    const config = generateSwaConfig("public", ["google"]);
    expect(config.auth).toBeUndefined();
  });

  it("includes navigationFallback and platform", () => {
    const config = generateSwaConfig("public", ["google"]);
    expect(config.navigationFallback.rewrite).toBe("/index.html");
    expect(config.platform.apiRuntime).toBe("node:18");
  });
});

// ── Dev mode ────────────────────────────────────────────────────────

describe("generateSwaConfig — dev", () => {
  const config = generateSwaConfig("dev");

  it("has no allowedRoles on any route", () => {
    for (const route of config.routes) {
      expect(route.allowedRoles).toBeUndefined();
    }
  });

  it("does not block any providers", () => {
    const blocked = blockedRoutes(config);
    expect(blocked).toHaveLength(0);
  });

  it("includes navigationFallback and platform", () => {
    expect(config.navigationFallback.rewrite).toBe("/index.html");
    expect(config.platform.apiRuntime).toBe("node:18");
  });

  it("has no auth config section", () => {
    expect(config.auth).toBeUndefined();
  });
});

// ── parseProviders ──────────────────────────────────────────────────

describe("parseProviders", () => {
  it("defaults to [google] when input is undefined", () => {
    expect(parseProviders(undefined)).toEqual(["google"]);
  });

  it("defaults to [google] when input is empty string", () => {
    expect(parseProviders("")).toEqual(["google"]);
  });

  it("parses comma-separated providers", () => {
    expect(parseProviders("google,github")).toEqual(["google", "github"]);
  });

  it("trims whitespace and lowercases", () => {
    expect(parseProviders(" Google , GitHub ")).toEqual(["google", "github"]);
  });

  it("filters empty segments", () => {
    expect(parseProviders("google,,github,")).toEqual(["google", "github"]);
  });
});
