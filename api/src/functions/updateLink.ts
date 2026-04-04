/**
 * PUT /api/links/:alias Azure Function
 *
 * Updates an existing alias record. Validates input, enforces authorization
 * (creator can update own; Admin can update any global; no one can update
 * another user's private alias), recalculates expiry on policy change,
 * and persists to Cosmos DB.
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
import {
    AliasRecord,
    UpdateAliasRequest,
    validateUpdateAliasRequest,
} from "../shared/models.js";

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

export function createUpdateLinkHandler(strategy: AuthStrategy) {
  return async function updateLinkHandler(
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

      // --- Parse request body ---
      let body: UpdateAliasRequest;
      try {
        body = (await req.json()) as UpdateAliasRequest;
      } catch {
        return { status: 400, body: "Invalid JSON body" };
      }

      // --- Validate request ---
      const validation = validateUpdateAliasRequest(body);
      if (!validation.valid) {
        return { status: 400, body: validation.error };
      }

      // --- Look up the alias record ---
      // First try private alias, then global
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
        // Private alias: only the creator can update
        if (record.created_by !== identity.email) {
          return { status: 403, body: "Forbidden" };
        }
      } else {
        // Global alias: creator can update own, Admin can update any
        if (record.created_by !== identity.email) {
          if (!identity.roles.includes("Admin")) {
            return { status: 403, body: "Forbidden" };
          }
        }
      }

      // --- Apply updates ---
      if (body.destination_url !== undefined) {
        record.destination_url = body.destination_url;
      }
      if (body.title !== undefined) {
        record.title = body.title;
      }
      if (body.is_private !== undefined) {
        record.is_private = body.is_private;
      }
      if (body.icon_url !== undefined) {
        record.icon_url = body.icon_url;
      }

      // --- Recalculate expiry if policy fields changed ---
      if (body.expiry_policy_type !== undefined) {
        const now = new Date();
        const expiry = computeExpiry({
          expiry_policy_type: body.expiry_policy_type,
          duration_months: body.duration_months,
          custom_expires_at: body.custom_expires_at,
          created_at: now.toISOString(),
          now,
        });
        record.expiry_policy_type = expiry.expiry_policy_type;
        record.duration_months = expiry.duration_months;
        record.custom_expires_at = body.custom_expires_at ?? null;
        record.expires_at = expiry.expires_at;
        record.expiry_status = expiry.expiry_status;
        record.expired_at = expiry.expired_at;
      }

      // --- Save to Cosmos DB ---
      const updated = await updateAlias(record);

      return {
        status: 200,
        headers: { "content-type": "application/json" },
        body: JSON.stringify(updated),
      };
    } catch (err: any) {
      context.error("Unexpected error in updateLink handler:", err);
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

export function registerUpdateLink(strategy: AuthStrategy): void {
  app.http("updateLink", {
    methods: ["PUT"],
    authLevel: "anonymous",
    route: "api/links/{alias}",
    handler: createUpdateLinkHandler(strategy),
  });
}
