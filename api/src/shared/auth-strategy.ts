import { parseClientPrincipal } from "./client-principal.js";

// ── Auth Mode & Identity ────────────────────────────────────────────

/** The three supported deployment modes. */
export type AuthMode = "corporate" | "public" | "dev";

/** Authenticated user identity extracted from request headers. */
export interface AuthIdentity {
  email: string;
  roles: string[];
}

// ── AuthStrategy Interface ──────────────────────────────────────────

/** Strategy interface that every auth mode must implement. */
export interface AuthStrategy {
  /** The active auth mode. */
  readonly mode: AuthMode;

  /** Extract identity from request headers. Returns null if unauthenticated. */
  extractIdentity(headers: Record<string, string>): AuthIdentity | null;

  /** Whether the redirect endpoint requires authentication. */
  readonly redirectRequiresAuth: boolean;

  /** Identity providers available in this mode (for frontend / SWA config). */
  readonly identityProviders: string[];
}

// ── Strategy Registry ───────────────────────────────────────────────

/** A constructor (factory function) that produces an AuthStrategy. */
export type StrategyConstructor = () => AuthStrategy;

/**
 * Central registry mapping each AuthMode to its strategy constructor.
 * Starts empty — strategy implementations register themselves via
 * `registerStrategy()`.
 */
const registry: Partial<Record<AuthMode, StrategyConstructor>> = {};

/**
 * Register (or replace) the strategy constructor for a given mode.
 * This keeps the registry extensible without modifying existing code.
 */
export function registerStrategy(
  mode: AuthMode,
  ctor: StrategyConstructor,
): void {
  registry[mode] = ctor;
}

/**
 * Retrieve the current registry snapshot (read-only).
 * Useful for testing and introspection.
 */
export function getRegistry(): Readonly<
  Partial<Record<AuthMode, StrategyConstructor>>
> {
  return registry;
}

// ── Strategy Factory ────────────────────────────────────────────────

/** Valid AuthMode values for validation. */
const VALID_MODES: readonly AuthMode[] = ["corporate", "public", "dev"];

function isValidAuthMode(value: string): value is AuthMode {
  return (VALID_MODES as readonly string[]).includes(value);
}

/**
 * Read `AUTH_MODE` and `CORPORATE_LOCK` env vars, validate, and return
 * a frozen AuthStrategy instance.
 *
 * Evaluation order (per Requirement 10.6):
 *   1. CORPORATE_LOCK check — before anything else
 *   2. AUTH_MODE validation
 *   3. Registry lookup & instantiation
 *   4. Freeze the instance so it cannot be mutated at runtime
 */
export function createStrategy(): AuthStrategy {
  const rawMode = process.env.AUTH_MODE;
  const corporateLock = process.env.CORPORATE_LOCK === "true";

  // 1. CORPORATE_LOCK is the very first check (Req 10.6)
  if (corporateLock && rawMode !== "corporate") {
    throw new Error(
      `CORPORATE_LOCK is enabled but AUTH_MODE is "${rawMode ?? "(not set)"}". ` +
        `Only "corporate" mode is allowed when CORPORATE_LOCK=true.`,
    );
  }

  // 2. Validate AUTH_MODE
  if (!rawMode || !isValidAuthMode(rawMode)) {
    const valid = VALID_MODES.join(", ");
    throw new Error(
      `Invalid or missing AUTH_MODE: "${rawMode ?? "(not set)"}". Must be one of: ${valid}`,
    );
  }

  // 3. Resolve constructor from registry
  const ctor = registry[rawMode];
  if (!ctor) {
    throw new Error(
      `No strategy registered for AUTH_MODE "${rawMode}". ` +
        `Did you forget to register the strategy?`,
    );
  }

  // 4. Instantiate and freeze (Req 1.4 — same instance for all handlers)
  const strategy = ctor();
  return Object.freeze(strategy);
}

// ── Corporate Strategy ──────────────────────────────────────────────

/**
 * Auth strategy for corporate deployments.
 * Requires Azure Entra ID (AAD) SSO for all interactions, including redirects.
 * Identity is extracted from the SWA `x-ms-client-principal` Base64 header.
 */
export class CorporateStrategy implements AuthStrategy {
  readonly mode: AuthMode = "corporate";
  readonly redirectRequiresAuth = true;
  readonly identityProviders = ["aad"];

  extractIdentity(headers: Record<string, string>): AuthIdentity | null {
    const header = headers["x-ms-client-principal"];
    if (!header) {
      return null;
    }

    try {
      const principal = parseClientPrincipal(header);
      if (!principal.userDetails) {
        return null;
      }
      return {
        email: principal.userDetails,
        roles: principal.userRoles,
      };
    } catch {
      return null;
    }
  }
}

// ── Public Strategy ─────────────────────────────────────────────────

/**
 * Auth strategy for public deployments.
 * Allows unauthenticated access to redirects; link management requires sign-in
 * via a configurable identity provider (default: Google).
 * Identity is extracted from the same SWA `x-ms-client-principal` header.
 */
export class PublicStrategy implements AuthStrategy {
  readonly mode: AuthMode = "public";
  readonly redirectRequiresAuth = false;
  readonly identityProviders: string[];

  constructor() {
    const raw = process.env.PUBLIC_AUTH_PROVIDERS;
    this.identityProviders = raw
      ? raw
          .split(",")
          .map((p) => p.trim())
          .filter(Boolean)
      : ["google"];
  }

  extractIdentity(headers: Record<string, string>): AuthIdentity | null {
    const header = headers["x-ms-client-principal"];
    if (!header) {
      return null;
    }

    try {
      const principal = parseClientPrincipal(header);
      if (!principal.userDetails) {
        return null;
      }
      return {
        email: principal.userDetails,
        roles: principal.userRoles,
      };
    } catch {
      return null;
    }
  }
}

// ── Dev Strategy ────────────────────────────────────────────────────

/**
 * Auth strategy for local development.
 * Provides mock identity without external identity providers.
 * Priority chain for email: x-mock-user-email header → DEV_USER_EMAIL env → "dev@localhost"
 * Priority chain for roles: x-mock-user-roles header → DEV_USER_ROLES env → "User"
 * Always returns a non-null identity (mock users are always authenticated).
 */
export class DevStrategy implements AuthStrategy {
  readonly mode: AuthMode = "dev";
  readonly redirectRequiresAuth = false;
  readonly identityProviders = ["dev"];

  extractIdentity(headers: Record<string, string>): AuthIdentity {
    const email =
      headers["x-mock-user-email"] ||
      process.env.DEV_USER_EMAIL ||
      "dev@localhost";

    const rawRoles =
      headers["x-mock-user-roles"] || process.env.DEV_USER_ROLES || "User";

    const roles = rawRoles
      .split(",")
      .map((r) => r.trim())
      .filter(Boolean);

    return { email, roles };
  }
}

// ── Self-registration ───────────────────────────────────────────────

registerStrategy("corporate", () => new CorporateStrategy());
registerStrategy("public", () => new PublicStrategy());
registerStrategy("dev", () => new DevStrategy());
