/**
 * POST /api/links Azure Function
 *
 * Creates a new alias record. Validates input, checks for global alias
 * name conflicts (case-insensitive), computes expiry, and persists to
 * Cosmos DB.
 */

import {
  app,
  HttpRequest,
  HttpResponseInit,
  InvocationContext,
} from "@azure/functions";
import type { AuthStrategy } from "../shared/auth-strategy.js";
import { createAlias, getAliasByPartition } from "../shared/cosmos-client.js";
import { computeExpiry } from "../shared/expiry-utils.js";
import {
  AliasRecord,
  CreateAliasRequest,
  generateAliasId,
  validateCreateAliasRequest,
} from "../shared/models.js";

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

export function createCreateLinkHandler(strategy: AuthStrategy) {
  return async function createLinkHandler(
    req: HttpRequest,
    context: InvocationContext,
  ): Promise<HttpResponseInit> {
    try {
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
      let body: CreateAliasRequest;
      try {
        body = (await req.json()) as CreateAliasRequest;
      } catch {
        return { status: 400, body: "Invalid JSON body" };
      }

      // --- Normalize alias to lowercase ---
      body.alias = body.alias?.toLowerCase();

      // --- Validate request ---
      const validation = validateCreateAliasRequest(body);
      if (!validation.valid) {
        return { status: 400, body: validation.error };
      }

      // --- Check for alias conflict ---
      const isPrivate = body.is_private ?? false;
      if (isPrivate) {
        const privateId = `${body.alias}:${identity.email}`;
        const existing = await getAliasByPartition(
          body.alias.toLowerCase(),
          privateId,
        );
        if (existing) {
          return {
            status: 409,
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              error: `You already have a private alias named "${body.alias}"`,
            }),
          };
        }
      } else {
        const existing = await getAliasByPartition(
          body.alias.toLowerCase(),
          body.alias.toLowerCase(),
        );
        if (existing) {
          return {
            status: 409,
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              error: `A global alias named "${body.alias}" already exists`,
            }),
          };
        }
      }

      // --- Compute expiry ---
      const now = new Date();
      const expiry = computeExpiry({
        expiry_policy_type: body.expiry_policy_type,
        duration_months: body.duration_months,
        custom_expires_at: body.custom_expires_at,
        created_at: now.toISOString(),
        now,
      });

      // --- Build alias record ---
      const record: AliasRecord = {
        id: generateAliasId(body.alias, isPrivate, identity.email),
        alias: body.alias,
        destination_url: body.destination_url,
        created_by: identity.email,
        title: body.title,
        click_count: 0,
        heat_score: 0,
        heat_updated_at: null,
        is_private: isPrivate,
        created_at: now.toISOString(),
        last_accessed_at: null,
        expiry_policy_type: expiry.expiry_policy_type,
        duration_months: expiry.duration_months,
        custom_expires_at: body.custom_expires_at ?? null,
        expires_at: expiry.expires_at,
        expiry_status: expiry.expiry_status,
        expired_at: null,
        icon_url: body.icon_url ?? null,
      };

      // --- Create in Cosmos DB ---
      const created = await createAlias(record);

      return {
        status: 201,
        headers: { "content-type": "application/json" },
        body: JSON.stringify(created),
      };
    } catch (err: any) {
      context.error("Unexpected error in createLink handler:", err);
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

export function registerCreateLink(strategy: AuthStrategy): void {
  app.http("createLink", {
    methods: ["POST"],
    authLevel: "anonymous",
    route: "api/links",
    handler: createCreateLinkHandler(strategy),
  });
}
