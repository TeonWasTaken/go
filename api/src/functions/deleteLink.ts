/**
 * DELETE /api/links/:alias Azure Function
 *
 * Deletes an existing alias record. Enforces authorization:
 * creator can delete own alias; Admin can delete any global alias;
 * no one can delete another user's private alias.
 */

import {
  app,
  HttpRequest,
  HttpResponseInit,
  InvocationContext,
} from "@azure/functions";
import { createAuthProvider } from "../shared/auth-provider.js";
import { deleteAlias, getAliasByPartition } from "../shared/cosmos-client.js";

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

export async function deleteLinkHandler(
  req: HttpRequest,
  context: InvocationContext,
): Promise<HttpResponseInit> {
  try {
    // --- Extract alias from route params ---
    const rawAlias = req.params.alias;
    if (!rawAlias) {
      return { status: 400, body: "Alias parameter is required" };
    }
    const alias = rawAlias.toLowerCase();

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

    // --- Look up the alias record ---
    // First try private alias, then global
    const privateId = alias + ":" + identity.email;
    let record = await getAliasByPartition(alias, privateId);
    if (!record) {
      record = await getAliasByPartition(alias, alias);
    }

    if (!record) {
      return { status: 404, body: "Alias not found" };
    }

    // --- Authorization check ---
    if (record.is_private) {
      // Private alias: only the creator can delete
      if (record.created_by !== identity.email) {
        return { status: 403, body: "Forbidden" };
      }
    } else {
      // Global alias: creator can delete own, Admin can delete any
      if (record.created_by !== identity.email) {
        if (!identity.roles.includes("Admin")) {
          return { status: 403, body: "Forbidden" };
        }
      }
    }

    // --- Delete from Cosmos DB ---
    await deleteAlias(alias, record.id);

    return { status: 204 };
  } catch (err: any) {
    context.error("Unexpected error in deleteLink handler:", err);
    return {
      status: 500,
      body: "An internal error occurred. Please try again later.",
    };
  }
}

// ---------------------------------------------------------------------------
// Register the Azure Function
// ---------------------------------------------------------------------------

app.http("deleteLink", {
  methods: ["DELETE"],
  authLevel: "anonymous",
  route: "api/links/{alias}",
  handler: deleteLinkHandler,
});
