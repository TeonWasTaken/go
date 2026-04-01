import * as fs from "node:fs";
import * as path from "node:path";

// ── Types ───────────────────────────────────────────────────────────

type AuthMode = "corporate" | "public" | "dev";

interface SwaRoute {
  route: string;
  rewrite?: string;
  redirect?: string;
  statusCode?: number;
  allowedRoles?: string[];
}

interface SwaConfig {
  auth?: {
    identityProviders?: {
      azureActiveDirectory?: {
        registration: {
          openIdIssuer: string;
          clientIdSettingName: string;
          clientSecretSettingName: string;
        };
      };
    };
  };
  routes: SwaRoute[];
  responseOverrides: {
    "401": {
      redirect: string;
      statusCode: number;
    };
  };
  navigationFallback: {
    rewrite: string;
    exclude: string[];
  };
  platform: {
    apiRuntime: string;
  };
}

// ── Known providers ─────────────────────────────────────────────────

const KNOWN_PROVIDERS = ["aad", "google", "github", "twitter"] as const;
type KnownProvider = (typeof KNOWN_PROVIDERS)[number];

const VALID_MODES: AuthMode[] = ["corporate", "public", "dev"];

// ── Shared config pieces ────────────────────────────────────────────

function baseNavigationFallback() {
  return {
    rewrite: "/index.html",
    exclude: ["/api/*", "/.auth/*"],
  };
}

function basePlatform() {
  return { apiRuntime: "node:18" };
}

function aadAuth() {
  return {
    identityProviders: {
      azureActiveDirectory: {
        registration: {
          openIdIssuer: "https://login.microsoftonline.com/{TENANT_ID}/v2.0",
          clientIdSettingName: "AAD_CLIENT_ID",
          clientSecretSettingName: "AAD_CLIENT_SECRET",
        },
      },
    },
  };
}
/** Produce a route that blocks a given auth provider with 404. */
function blockProvider(provider: string): SwaRoute {
  return { route: `/.auth/login/${provider}`, statusCode: 404 };
}

/** Common page rewrite routes (interstitial, kitchen-sink, manage). */
function pageRewrites(): SwaRoute[] {
  return [
    { route: "/interstitial", rewrite: "/index.html" },
    { route: "/kitchen-sink", rewrite: "/index.html" },
    { route: "/manage", rewrite: "/index.html" },
  ];
}

/** The alias rewrite route. */
function aliasRewrite(requireAuth: boolean): SwaRoute {
  const route: SwaRoute = {
    route: "/{alias}",
    rewrite: "/api/redirect/{alias}",
  };
  if (requireAuth) {
    route.allowedRoles = ["authenticated"];
  }
  return route;
}

// ── Template generators ─────────────────────────────────────────────

function generateCorporateConfig(): SwaConfig {
  const blockedProviders: KnownProvider[] = ["github", "twitter", "google"];

  return {
    auth: aadAuth(),
    routes: [
      ...blockedProviders.map(blockProvider),
      {
        route: "/login",
        redirect: "/.auth/login/aad?post_login_redirect_uri=.referrer",
      },
      { route: "/api/*", allowedRoles: ["authenticated"] },
      ...pageRewrites(),
      aliasRewrite(false),
      { route: "/*", allowedRoles: ["authenticated"] },
    ],
    responseOverrides: {
      "401": {
        redirect: "/.auth/login/aad?post_login_redirect_uri=.referrer",
        statusCode: 302,
      },
    },
    navigationFallback: baseNavigationFallback(),
    platform: basePlatform(),
  };
}

function generatePublicConfig(providers: string[]): SwaConfig {
  const primaryProvider = providers[0];
  const enabledSet = new Set(providers);

  // Block every known provider that is NOT in the enabled list
  const blocked = KNOWN_PROVIDERS.filter((p) => !enabledSet.has(p));

  return {
    auth: enabledSet.has("aad") ? aadAuth() : undefined,
    routes: [
      ...blocked.map(blockProvider),
      {
        route: "/login",
        redirect: `/.auth/login/${primaryProvider}?post_login_redirect_uri=.referrer`,
      },
      { route: "/api/*", allowedRoles: ["authenticated"] },
      ...pageRewrites(),
      aliasRewrite(false), // /{alias} is open — no allowedRoles
      { route: "/*", allowedRoles: ["authenticated"] },
    ],
    responseOverrides: {
      "401": {
        redirect: `/.auth/login/${primaryProvider}?post_login_redirect_uri=.referrer`,
        statusCode: 302,
      },
    },
    navigationFallback: baseNavigationFallback(),
    platform: basePlatform(),
  };
}

function generateDevConfig(): SwaConfig {
  return {
    routes: [
      {
        route: "/login",
        redirect: "/.auth/login/aad?post_login_redirect_uri=.referrer",
      },
      ...pageRewrites(),
      aliasRewrite(false),
    ],
    responseOverrides: {
      "401": {
        redirect: "/.auth/login/aad?post_login_redirect_uri=.referrer",
        statusCode: 302,
      },
    },
    navigationFallback: baseNavigationFallback(),
    platform: basePlatform(),
  };
}

// ── Public API (exported for testing) ───────────────────────────────

/**
 * Generate the SWA config object for the given auth mode and providers.
 * This is the core pure function — no I/O, no env vars.
 */
export function generateSwaConfig(
  mode: AuthMode,
  providers: string[] = ["google"],
): SwaConfig {
  switch (mode) {
    case "corporate":
      return generateCorporateConfig();
    case "public":
      return generatePublicConfig(providers);
    case "dev":
      return generateDevConfig();
  }
}

/**
 * Parse and validate the PUBLIC_AUTH_PROVIDERS string.
 * Returns the provider list and logs warnings for unknown providers.
 */
export function parseProviders(raw: string | undefined): string[] {
  if (!raw) return ["google"];

  const providers = raw
    .split(",")
    .map((p) => p.trim().toLowerCase())
    .filter(Boolean);

  if (providers.length === 0) return ["google"];

  const knownSet = new Set<string>(KNOWN_PROVIDERS);
  for (const p of providers) {
    if (!knownSet.has(p)) {
      console.warn(`Warning: unknown provider "${p}" in PUBLIC_AUTH_PROVIDERS`);
    }
  }

  return providers;
}

// ── CLI entry point ─────────────────────────────────────────────────

function main() {
  const mode = process.env.AUTH_MODE;

  if (!mode) {
    console.error("Error: AUTH_MODE environment variable is not set.");
    process.exit(1);
  }

  if (!VALID_MODES.includes(mode as AuthMode)) {
    console.error(
      `Error: Invalid AUTH_MODE "${mode}". Must be one of: ${VALID_MODES.join(", ")}`,
    );
    process.exit(1);
  }

  const providers = parseProviders(process.env.PUBLIC_AUTH_PROVIDERS);
  const config = generateSwaConfig(mode as AuthMode, providers);

  const outPath = path.resolve(process.cwd(), "staticwebapp.config.json");
  fs.writeFileSync(outPath, JSON.stringify(config, null, 2) + "\n", "utf-8");

  console.log(`Generated ${outPath} for AUTH_MODE="${mode}"`);
}

// Run when executed directly (not imported)
const isDirectRun =
  typeof process !== "undefined" &&
  process.argv[1] &&
  (process.argv[1].endsWith("generate-swa-config.ts") ||
    process.argv[1].endsWith("generate-swa-config.js"));

if (isDirectRun) {
  main();
}
