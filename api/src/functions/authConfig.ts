/**
 * GET /api/auth-config Azure Function
 *
 * Returns the active authentication configuration so the frontend can
 * adapt its login flow and UI. This endpoint is unauthenticated — no
 * identity check is performed.
 */

import {
  app,
  HttpRequest,
  HttpResponseInit,
  InvocationContext,
} from "@azure/functions";
import type { AuthStrategy } from "../shared/auth-strategy.js";

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

export function createAuthConfigHandler(strategy: AuthStrategy) {
  return async function authConfigHandler(
    _req: HttpRequest,
    _context: InvocationContext,
  ): Promise<HttpResponseInit> {
    const primaryProvider = strategy.identityProviders[0] ?? "aad";
    const loginUrl = `/.auth/login/${primaryProvider}`;

    const aliasPrefix = process.env.ALIAS_PREFIX || "go";
    const allowPublicCreate = process.env.RESTRICT_CREATE_TO_ADMINS !== "true";

    const response: Record<string, unknown> = {
      mode: strategy.mode,
      identityProviders: strategy.identityProviders,
      loginUrl,
      aliasPrefix,
      allowPublicCreate,
    };

    // In dev mode, include the mock user identity so the frontend
    // can display it without needing the /.auth/me SWA endpoint.
    if (strategy.mode === "dev") {
      const identity = strategy.extractIdentity({});
      if (identity) {
        response.devUser = { email: identity.email, roles: identity.roles };
      }
    }

    return {
      status: 200,
      headers: { "content-type": "application/json" },
      body: JSON.stringify(response),
    };
  };
}

// ---------------------------------------------------------------------------
// Register the Azure Function
// ---------------------------------------------------------------------------

export function registerAuthConfig(strategy: AuthStrategy): void {
  app.http("authConfig", {
    methods: ["GET"],
    authLevel: "anonymous",
    route: "api/auth-config",
    handler: createAuthConfigHandler(strategy),
  });
}
