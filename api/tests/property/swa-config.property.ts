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
