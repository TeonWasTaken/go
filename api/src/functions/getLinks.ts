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
import { createAuthProvider } from "../shared/auth-provider.js";
import {
  getPopularGlobalAliases,
  listAliasesForUser,
  searchAliases,
} from "../shared/cosmos-client.js";

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

export async function getLinksHandler(
  req: HttpRequest,
  context: InvocationContext,
): Promise<HttpResponseInit> {
  try {
    // --- Extract user identity ---
    const authProvider = createAuthProvider();
    const headers: Record<string, string> = {};
    req.headers.forEach((value, key) => {
      headers[key.toLowerCase()] = value;
    });
    const identity = authProvider.extractIdentity(headers);
    if (!identity) {
      return { status: 401, body: "Unauthorized" };
    }

    const email = identity.email;

    // --- Parse query parameters ---
    const search = req.query.get("search") || undefined;
    const sortRaw = req.query.get("sort") || undefined;
    const sort =
      sortRaw === "clicks" || sortRaw === "heat" ? sortRaw : undefined;
    const scope = req.query.get("scope") || undefined;

    // --- Scope: popular ---
    if (scope === "popular") {
      const records = await getPopularGlobalAliases(10);
      return {
        status: 200,
        headers: { "content-type": "application/json" },
        body: JSON.stringify(records),
      };
    }

    // --- Search ---
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
}

// ---------------------------------------------------------------------------
// Register the Azure Function
// ---------------------------------------------------------------------------

app.http("getLinks", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "api/links",
  handler: getLinksHandler,
});
