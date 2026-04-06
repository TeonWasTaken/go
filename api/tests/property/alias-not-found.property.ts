import fc from "fast-check";
import * as fs from "node:fs";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import { generateSwaConfig } from "../../../scripts/generate-swa-config.js";

// ── Generators ──────────────────────────────────────────────────────

const KNOWN_PROVIDERS = ["aad", "google", "github", "twitter"] as const;

type AuthMode = "corporate" | "public" | "dev";

/** Arbitrary non-empty subset of known providers. */
const providerSubsetArb = fc
  .subarray([...KNOWN_PROVIDERS], { minLength: 1 })
  .map((arr) => [...arr]);

/** Arbitrary auth mode with a valid provider list for that mode. */
const authModeWithProvidersArb: fc.Arbitrary<[AuthMode, string[]]> = fc.oneof(
  fc.constant(["corporate", ["aad"]] as [AuthMode, string[]]),
  providerSubsetArb.map(
    (providers) => ["public", providers] as [AuthMode, string[]],
  ),
  fc.constant(["dev", ["aad"]] as [AuthMode, string[]]),
);

// ── Bug Condition Exploration: Property 1 ───────────────────────────
// Non-existent alias path not served by SWA or React
// These tests encode the EXPECTED (fixed) behavior.
// They are expected to FAIL on unfixed code, proving the bug exists.

describe("Bug Condition: generateSwaConfig includes /_/not-found route", () => {
  /**
   * **Validates: Requirements 1.1, 1.2, 1.3, 2.1, 2.2, 2.3**
   *
   * For all auth modes (corporate, public, dev), the generated SWA config
   * must include a route { route: "/_/not-found", rewrite: "/index.html" } so that
   * the /_/not-found?suggest=<alias> redirect target is served by the frontend.
   */
  it("all auth modes include a /_/not-found route that rewrites to /index.html", () => {
    fc.assert(
      fc.property(authModeWithProvidersArb, ([mode, providers]) => {
        const config = generateSwaConfig(mode, providers);
        const notFoundRoute = config.routes.find((r) => r.route === "/_/not-found");
        expect(notFoundRoute).toBeDefined();
        expect(notFoundRoute!.rewrite).toBe("/index.html");
      }),
      { numRuns: 100 },
    );
  });
});

describe("Bug Condition: committed staticwebapp.config.json includes /_/not-found route", () => {
  /**
   * **Validates: Requirements 1.3, 2.3**
   *
   * The committed staticwebapp.config.json must contain a route for /_/not-found
   * that rewrites to /index.html, so Azure SWA serves the React app
   * when the redirect API sends a 302 to /_/not-found?suggest=<alias>.
   */
  it("staticwebapp.config.json has a /_/not-found route with rewrite to /index.html", () => {
    const configPath = path.resolve(
      __dirname,
      "../../../staticwebapp.config.json",
    );
    const config = JSON.parse(fs.readFileSync(configPath, "utf-8"));
    const notFoundRoute = config.routes.find(
      (r: { route: string }) => r.route === "/_/not-found",
    );
    expect(notFoundRoute).toBeDefined();
    expect(notFoundRoute.rewrite).toBe("/index.html");
  });
});

// ── Preservation: Property 2 ────────────────────────────────────────
// Existing routes and behaviors unchanged.
// These tests capture baseline behavior on UNFIXED code.
// They are expected to PASS — confirming behavior we must preserve.

const EXPECTED_PAGE_ROUTES = ["/_/interstitial", "/_/kitchen-sink", "/_/manage"];

describe("Preservation: existing page rewrite routes present in generated config", () => {
  /**
   * **Validates: Requirements 3.5, 3.6**
   *
   * For all auth modes, the generated SWA config must include routes for
   * /_/interstitial, /_/kitchen-sink, and /_/manage, each rewriting to /index.html.
   */
  it("all auth modes include /_/interstitial, /_/kitchen-sink, /_/manage with rewrite to /index.html", () => {
    fc.assert(
      fc.property(authModeWithProvidersArb, ([mode, providers]) => {
        const config = generateSwaConfig(mode, providers);
        for (const expectedRoute of EXPECTED_PAGE_ROUTES) {
          const found = config.routes.find((r) => r.route === expectedRoute);
          expect(found, `missing route ${expectedRoute} in mode=${mode}`).toBeDefined();
          expect(found!.rewrite).toBe("/index.html");
        }
      }),
      { numRuns: 100 },
    );
  });
});

describe("Preservation: /{alias} catch-all appears after all /_/ routes", () => {
  /**
   * **Validates: Requirements 3.1, 3.2**
   *
   * For all auth modes, the /{alias} rewrite to /api/redirect/{alias} must
   * appear after all /_/-prefixed routes so that explicit page routes take
   * priority over the alias catch-all.
   */
  it("/{alias} route index is greater than all /_/-prefixed route indices", () => {
    fc.assert(
      fc.property(authModeWithProvidersArb, ([mode, providers]) => {
        const config = generateSwaConfig(mode, providers);
        const aliasIndex = config.routes.findIndex((r) => r.route === "/{alias}");
        expect(aliasIndex, `/{alias} route missing in mode=${mode}`).toBeGreaterThanOrEqual(0);

        const underscoreIndices = config.routes
          .map((r, i) => (r.route.startsWith("/_/") ? i : -1))
          .filter((i) => i >= 0);

        for (const idx of underscoreIndices) {
          expect(aliasIndex, `/{alias} at ${aliasIndex} should be after /_/ route at ${idx}`).toBeGreaterThan(idx);
        }
      }),
      { numRuns: 100 },
    );
  });
});

describe("Preservation: navigationFallback.exclude contains /_/*", () => {
  /**
   * **Validates: Requirements 3.4, 3.5, 3.6**
   *
   * For all auth modes, the navigationFallback.exclude array must contain
   * "/_/*" so that /_/-prefixed paths are not caught by the fallback.
   */
  it("all auth modes have /_/* in navigationFallback.exclude", () => {
    fc.assert(
      fc.property(authModeWithProvidersArb, ([mode, providers]) => {
        const config = generateSwaConfig(mode, providers);
        expect(config.navigationFallback.exclude).toContain("/_/*");
      }),
      { numRuns: 100 },
    );
  });
});

describe("Preservation: committed staticwebapp.config.json has existing routes", () => {
  /**
   * **Validates: Requirements 3.5, 3.6**
   *
   * The committed staticwebapp.config.json must contain routes for
   * /_/interstitial, /_/kitchen-sink, /_/manage, and /{alias}.
   * The /_/manage route must have allowedRoles: ["authenticated"].
   */
  it("staticwebapp.config.json contains /_/interstitial, /_/kitchen-sink, /_/manage, and /{alias}", () => {
    const configPath = path.resolve(
      __dirname,
      "../../../staticwebapp.config.json",
    );
    const config = JSON.parse(fs.readFileSync(configPath, "utf-8"));

    for (const expectedRoute of EXPECTED_PAGE_ROUTES) {
      const found = config.routes.find(
        (r: { route: string }) => r.route === expectedRoute,
      );
      expect(found, `missing route ${expectedRoute}`).toBeDefined();
      expect(found.rewrite).toBe("/index.html");
    }

    const aliasRoute = config.routes.find(
      (r: { route: string }) => r.route === "/{alias}",
    );
    expect(aliasRoute, "missing /{alias} route").toBeDefined();
    expect(aliasRoute.rewrite).toBe("/api/redirect/{alias}");
  });

  it("/_/manage route has allowedRoles: ['authenticated'] in committed config", () => {
    const configPath = path.resolve(
      __dirname,
      "../../../staticwebapp.config.json",
    );
    const config = JSON.parse(fs.readFileSync(configPath, "utf-8"));
    const manageRoute = config.routes.find(
      (r: { route: string }) => r.route === "/_/manage",
    );
    expect(manageRoute).toBeDefined();
    expect(manageRoute.allowedRoles).toEqual(["authenticated"]);
  });
});
