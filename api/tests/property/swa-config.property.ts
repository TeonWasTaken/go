import fc from "fast-check";
import * as fs from "node:fs";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import { generateSwaConfig } from "../../../scripts/generate-swa-config.js";

// ── Constants ───────────────────────────────────────────────────────

const KNOWN_PROVIDERS = ["aad", "google", "github", "twitter"] as const;

// ── Helpers ─────────────────────────────────────────────────────────

/** Extract provider names from routes that have statusCode 404. */
function blockedProviders(
  config: ReturnType<typeof generateSwaConfig>,
): string[] {
  return config.routes
    .filter((r) => r.statusCode === 404)
    .map((r) => r.route.replace("/.auth/login/", ""));
}

// ── Generators ──────────────────────────────────────────────────────

/** Arbitrary non-empty subset of known providers. */
const providerSubsetArb = fc
  .subarray([...KNOWN_PROVIDERS], { minLength: 1 })
  .map((arr) => [...arr]); // ensure a fresh mutable copy

/** Arbitrary single known provider. */
const singleProviderArb = fc.constantFrom(...KNOWN_PROVIDERS);

// ── Generator: arbitrary auth mode with matching providers ──────────

type AuthMode = "corporate" | "public" | "dev";

/** Arbitrary auth mode with a valid provider list for that mode. */
const authModeWithProvidersArb: fc.Arbitrary<[AuthMode, string[]]> = fc.oneof(
  fc.constant(["corporate", ["aad"]] as [AuthMode, string[]]),
  providerSubsetArb.map(
    (providers) => ["public", providers] as [AuthMode, string[]],
  ),
  fc.constant(["dev", ["aad"]] as [AuthMode, string[]]),
);

// ── Feature: route-prefix-namespacing, Property 1: Generated config app routes use /_/ prefix ──

describe("Property 1: Generated config app routes use /_/ prefix", () => {
  /**
   * **Validates: Requirements 1.1, 2.1**
   *
   * For any auth mode and valid provider list, calling generateSwaConfig()
   * should produce a routes array where every SPA page rewrite route
   * (manage, interstitial, kitchen-sink) has a /_/ prefix and rewrites
   * to /index.html.
   */
  it("all SPA page rewrite routes have /_/ prefix and rewrite to /index.html", () => {
    fc.assert(
      fc.property(authModeWithProvidersArb, ([mode, providers]) => {
        const config = generateSwaConfig(mode, providers);
        const appPages = ["/_/manage", "/_/interstitial", "/_/kitchen-sink"];

        for (const page of appPages) {
          const route = config.routes.find((r) => r.route === page);
          expect(route).toBeDefined();
          expect(route!.rewrite).toBe("/index.html");
        }
      }),
      { numRuns: 100 },
    );
  });
});

// ── Feature: route-prefix-namespacing, Property 2: Alias catch-all appears after all prefixed app routes ──

describe("Property 2: Alias catch-all appears after all prefixed app routes", () => {
  /**
   * **Validates: Requirements 1.2, 2.2**
   *
   * For any auth mode and provider list, in the routes array produced by
   * generateSwaConfig(), the index of the /{alias} rewrite rule should be
   * greater than the index of every /_/-prefixed route.
   */
  it("/{alias} index is greater than all /_/-prefixed route indices", () => {
    fc.assert(
      fc.property(authModeWithProvidersArb, ([mode, providers]) => {
        const config = generateSwaConfig(mode, providers);
        const aliasIndex = config.routes.findIndex(
          (r) => r.route === "/{alias}",
        );
        expect(aliasIndex).toBeGreaterThan(-1);

        const prefixedIndices = config.routes
          .map((r, i) => (r.route.startsWith("/_/") ? i : -1))
          .filter((i) => i >= 0);

        for (const idx of prefixedIndices) {
          expect(aliasIndex).toBeGreaterThan(idx);
        }
      }),
      { numRuns: 100 },
    );
  });
});

// ── Feature: route-prefix-namespacing, Property 3: navigationFallback excludes /_/* ──

describe("Property 3: navigationFallback excludes /_/*", () => {
  /**
   * **Validates: Requirements 2.3**
   *
   * For any auth mode and provider list, the navigationFallback.exclude
   * array produced by generateSwaConfig() should contain /_/* alongside
   * /api/* and /.auth/*.
   */
  it("navigationFallback.exclude contains /_/*, /api/*, and /.auth/*", () => {
    fc.assert(
      fc.property(authModeWithProvidersArb, ([mode, providers]) => {
        const config = generateSwaConfig(mode, providers);
        const exclude = config.navigationFallback.exclude;

        expect(exclude).toContain("/_/*");
        expect(exclude).toContain("/api/*");
        expect(exclude).toContain("/.auth/*");
      }),
      { numRuns: 100 },
    );
  });
});

// ── Feature: route-prefix-namespacing, Property 4: Login route remains unprefixed ──

describe("Property 4: Login route remains unprefixed", () => {
  /**
   * **Validates: Requirements 1.4**
   *
   * For any auth mode and provider list, the generated config should
   * contain a /login route (not /_/login) that redirects to a
   * /.auth/login/ provider endpoint.
   */
  it("/login route exists without /_/ prefix and redirects to /.auth/login/", () => {
    fc.assert(
      fc.property(authModeWithProvidersArb, ([mode, providers]) => {
        const config = generateSwaConfig(mode, providers);
        const loginRoute = config.routes.find((r) => r.route === "/login");

        expect(loginRoute).toBeDefined();
        expect(loginRoute!.redirect).toMatch(/^\/\.auth\/login\//);

        // Ensure no /_/login route exists
        const prefixedLogin = config.routes.find(
          (r) => r.route === "/_/login",
        );
        expect(prefixedLogin).toBeUndefined();
      }),
      { numRuns: 100 },
    );
  });
});

// ── Feature: multi-tenant-auth-modes, Property 12: SWA config provider enablement ──

describe("Property 12: SWA config provider enablement", () => {
  /**
   * **Validates: Requirements 4.1, 4.11, 4.12**
   *
   * For any set of identity providers in the PUBLIC_AUTH_PROVIDERS list,
   * the generated public-mode SWA config enables exactly those providers
   * (no 404 block) and blocks all known providers not in the list with a
   * 404 status code.
   */
  it("enables exactly the given providers and blocks the rest", () => {
    fc.assert(
      fc.property(providerSubsetArb, (providers) => {
        const config = generateSwaConfig("public", providers);
        const blocked = new Set(blockedProviders(config));
        const enabledSet = new Set(providers);

        for (const known of KNOWN_PROVIDERS) {
          if (enabledSet.has(known)) {
            // Enabled providers must NOT be blocked
            expect(blocked.has(known)).toBe(false);
          } else {
            // Providers not in the list must be blocked with 404
            expect(blocked.has(known)).toBe(true);
          }
        }
      }),
      { numRuns: 100 },
    );
  });
});

// ── Feature: multi-tenant-auth-modes, Property 13: SWA config 401 redirect targets primary provider ──

describe("Property 13: SWA config 401 redirect targets primary provider", () => {
  /**
   * **Validates: Requirements 8.3**
   *
   * For any configured primary identity provider in public mode, the
   * generated SWA config's responseOverrides["401"] redirect URL points
   * to `/.auth/login/{primaryProvider}`.
   */
  it("401 redirect points to /.auth/login/{primaryProvider}", () => {
    fc.assert(
      fc.property(singleProviderArb, (provider) => {
        const config = generateSwaConfig("public", [provider]);
        const redirect = config.responseOverrides["401"].redirect;

        expect(redirect).toContain(`/.auth/login/${provider}`);
      }),
      { numRuns: 100 },
    );
  });
});

// ── CP-7: Node.js runtime version ───────────────────────────────────

describe("CP-7: Node.js runtime version", () => {
  /**
   * **Validates: Requirements 2.5**
   *
   * The committed staticwebapp.config.json must specify node:20 as the
   * API runtime so Azure Functions uses the faster Node 20 engine.
   */
  it("staticwebapp.config.json specifies node:20 runtime", () => {
    const configPath = path.resolve(
      __dirname,
      "../../../staticwebapp.config.json",
    );
    const config = JSON.parse(fs.readFileSync(configPath, "utf-8"));
    expect(config.platform.apiRuntime).toBe("node:20");
  });
});
