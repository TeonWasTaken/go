import { parseClientPrincipal } from "./client-principal.js";

export interface AuthIdentity {
  email: string;
  roles: string[];
}

export interface AuthProvider {
  extractIdentity(headers: Record<string, string>): AuthIdentity | null;
}

/**
 * Production auth provider that extracts identity from SWA's
 * Base64-encoded x-ms-client-principal header.
 */
export class SwaAuthProvider implements AuthProvider {
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

/**
 * Dev-mode auth provider that reads mock headers or falls back to
 * DEV_USER_EMAIL / DEV_USER_ROLES env vars (default dev@localhost / User).
 */
export class MockAuthProvider implements AuthProvider {
  extractIdentity(headers: Record<string, string>): AuthIdentity | null {
    const email =
      headers["x-mock-user-email"] ||
      process.env.DEV_USER_EMAIL ||
      "dev@localhost";

    const rolesRaw =
      headers["x-mock-user-roles"] || process.env.DEV_USER_ROLES || "User";

    const roles = rolesRaw
      .split(",")
      .map((r) => r.trim())
      .filter(Boolean);

    return { email, roles };
  }
}

/**
 * Factory: returns MockAuthProvider when DEV_MODE === 'true',
 * otherwise SwaAuthProvider.
 */
export function createAuthProvider(): AuthProvider {
  if (process.env.DEV_MODE === "true") {
    return new MockAuthProvider();
  }
  return new SwaAuthProvider();
}
