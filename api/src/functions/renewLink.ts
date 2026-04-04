/**
 * PUT /api/links/:alias/renew Azure Function
 *
 * Renews an existing alias record. Resets `expires_at` based on the
 * current expiry policy, sets `expiry_status` to `active` (or `no_expiry`
 * if policy is `never`), and clears `expired_at`.
 *
 * Authorization: creator can renew own alias; Admin can renew any global
 * alias; no one can renew another user's private alias.
 */

import {
    app,
    HttpRequest,
    HttpResponseInit,
    InvocationContext,
} from "@azure/functions";
import type { AuthStrategy } from "../shared/auth-strategy.js";
import { getAliasByPartition, updateAlias } from "../shared/cosmos-client.js";
import { computeExpiry } from "../shared/expiry-utils.js";
import { AliasRecord } from "../shared/models.js";

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

export function createRenewLinkHandler(strategy: AuthStrategy) {
  return async function renewLinkHandler(
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
      const headers: Record<string, string> = {};
      req.headers.forEach((value, key) => {
        headers[key.toLowerCase()] = value;
      });
      const identity = strategy.extractIdentity(headers);
      if (!identity) {
        return { status: 401, body: "Unauthorized" };
      }

      // --- Look up the alias record ---
      const privateId = alias + ":" + identity.email;
      let record: AliasRecord | undefined;

      record = await getAliasByPartition(alias, privateId);
      if (!record) {
        record = await getAliasByPartition(alias, alias);
      }

      if (!record) {
        return { status: 404, body: "Alias not found" };
      }

      // --- Authorization check ---
      if (record.is_private) {
        // Private alias: only the creator can renew
        if (record.created_by !== identity.email) {
          return { status: 403, body: "Forbidden" };
        }
      } else {
        // Global alias: creator can renew own, Admin can renew any
        if (record.created_by !== identity.email) {
          if (!identity.roles.includes("Admin")) {
            return { status: 403, body: "Forbidden" };
          }
        }
      }

      // --- Recalculate expiry based on current policy ---
      const now = new Date();
      const expiry = computeExpiry({
        expiry_policy_type: record.expiry_policy_type,
        duration_months: record.duration_months ?? undefined,
        custom_expires_at: record.custom_expires_at ?? undefined,
        created_at: now.toISOString(),
        now,
      });

      record.expires_at = expiry.expires_at;
      record.expiry_status = expiry.expiry_status;
      record.expired_at = expiry.expired_at;

      // --- Save to Cosmos DB ---
      const updated = await updateAlias(record);

      return {
        status: 200,
        headers: { "content-type": "application/json" },
        body: JSON.stringify(updated),
      };
    } catch (err: any) {
      context.error("Unexpected error in renewLink handler:", err);
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

export function registerRenewLink(strategy: AuthStrategy): void {
  app.http("renewLink", {
    methods: ["PUT"],
    authLevel: "anonymous",
    route: "api/links/{alias}/renew",
    handler: createRenewLinkHandler(strategy),
  });
}
