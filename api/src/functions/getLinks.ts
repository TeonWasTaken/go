/**
 * GET /api/links Azure Function
 *
 * Returns all global aliases plus the authenticated user's private aliases.
 * Supports search, sort, and scope query parameters.
 */

import {
  app,
  HttpRequest,
  HttpResponseInit,
  InvocationContext,
} from "@azure/functions";
import type { AuthStrategy } from "../shared/auth-strategy.js";
import {
  getPopularGlobalAliases,
  getPopularGlobalAliasesByClicks,
  listAliasesForUser,
  searchAliases,
  searchPublicAliases,
} from "../shared/cosmos-client.js";

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

export function createGetLinksHandler(strategy: AuthStrategy) {
  return async function getLinksHandler(
    req: HttpRequest,
    context: InvocationContext,
  ): Promise<HttpResponseInit> {
    try {
      // --- Parse query parameters ---
      const scope = req.query.get("scope") || undefined;
      const popularMaxAge = parseInt(
        process.env.CACHE_MAX_AGE_POPULAR || "3600",
        10,
      );

      // --- Scope: popular (no auth required) ---
      if (scope === "popular") {
        const records = await getPopularGlobalAliases(10);
        return {
          status: 200,
          headers: {
            "content-type": "application/json",
            "cache-control": `public, max-age=${popularMaxAge}`,
          },
          body: JSON.stringify(records),
        };
      }

      if (scope === "popular-clicks") {
        const records = await getPopularGlobalAliasesByClicks(10);
        return {
          status: 200,
          headers: {
            "content-type": "application/json",
            "cache-control": `public, max-age=${popularMaxAge}`,
          },
          body: JSON.stringify(records),
        };
      }

      // --- Extract user identity ---
      const headers: Record<string, string> = {};
      req.headers.forEach((value, key) => {
        headers[key.toLowerCase()] = value;
      });
      const identity = strategy.extractIdentity(headers);

      // --- Parse remaining query parameters ---
      const search = req.query.get("search") || undefined;
      const sortRaw = req.query.get("sort") || undefined;
      const sort =
        sortRaw === "clicks" || sortRaw === "heat" ? sortRaw : undefined;

      // --- Anonymous search: public aliases only ---
      if (!identity && search) {
        const records = await searchPublicAliases(search);
        return {
          status: 200,
          headers: { "content-type": "application/json" },
          body: JSON.stringify(records),
        };
      }

      if (!identity) {
        return { status: 401, body: "Unauthorized" };
      }

      const email = identity.email;

      // --- Authenticated search ---
      if (search) {
        const records = await searchAliases(email, search);
        return {
          status: 200,
          headers: { "content-type": "application/json" },
          body: JSON.stringify(records),
        };
      }

      // --- Default listing ---
      const records = await listAliasesForUser(email, sort);
      return {
        status: 200,
        headers: { "content-type": "application/json" },
        body: JSON.stringify(records),
      };
    } catch (err: any) {
      context.error("Unexpected error in getLinks handler:", err);
      return {
        status: 500,
        body: "An internal error occurred. Please try again later.",
      };
    }
  };
}

// ---------------------------------------------------------------------------
// Register the Azure Function
// ---------------------------------------------------------------------------

export function registerGetLinks(strategy: AuthStrategy): void {
  app.http("getLinks", {
    methods: ["GET"],
    authLevel: "anonymous",
    route: "api/links",
    handler: createGetLinksHandler(strategy),
  });
}
