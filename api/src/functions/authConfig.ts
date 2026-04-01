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

    return {
      status: 200,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        mode: strategy.mode,
        identityProviders: strategy.identityProviders,
        loginUrl,
      }),
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
