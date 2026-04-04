/**
 * Redirect Azure Function — GET /:alias
 *
 * Resolves an alias to its destination URL and performs an HTTP 302 redirect.
 * Handles private-first resolution, interstitial conflict pages, expiry checks,
 * analytics updates (click_count, last_accessed_at, heat_score), inactivity
 * expiry resets, and query string / fragment passthrough.
 *
 * Auth branching via `strategy.redirectRequiresAuth`:
 *   - true  + null identity → 401
 *   - false + null identity → resolve only global non-private aliases
 *   - false + identity      → resolve both private and global (existing behavior)
 */

import {
    app,
    HttpRequest,
    HttpResponseInit,
    InvocationContext,
} from "@azure/functions";
import type { AuthStrategy } from "../shared/auth-strategy.js";
import { getAliasByPartition, updateAlias } from "../shared/cosmos-client.js";
import { computeHeatScore } from "../shared/heat-utils.js";
import { AliasRecord } from "../shared/models.js";
import { mergeUrls } from "../shared/url-utils.js";

// ---------------------------------------------------------------------------
// Analytics + expiry side-effects
// ---------------------------------------------------------------------------

async function applyRedirectSideEffects(
  record: AliasRecord,
  now: Date,
): Promise<void> {
  // Increment click count
  record.click_count += 1;
  record.last_accessed_at = now.toISOString();

  // Update heat score
  const heatUpdate = computeHeatScore({
    current_heat_score: record.heat_score,
    heat_updated_at: record.heat_updated_at,
    now,
  });
  record.heat_score = heatUpdate.heat_score;
  record.heat_updated_at = heatUpdate.heat_updated_at;

  // For inactivity policy, reset expires_at to 12 months from now
  if (record.expiry_policy_type === "inactivity") {
    const resetDate = new Date(now.getTime());
    resetDate.setUTCMonth(resetDate.getUTCMonth() + 12);
    record.expires_at = resetDate.toISOString();
  }

  await updateAlias(record);
}

// ---------------------------------------------------------------------------
// Main handler factory
// ---------------------------------------------------------------------------

export function createRedirectHandler(strategy: AuthStrategy) {
  return async function redirectHandler(
    req: HttpRequest,
    context: InvocationContext,
  ): Promise<HttpResponseInit> {
    try {
      // --- Extract alias from route param ---
      const rawAlias = req.params.alias;
      if (!rawAlias) {
        return { status: 302, headers: { location: "/_/" } };
      }
      const alias = rawAlias.toLowerCase();

      // --- Extract user identity ---
      const headers: Record<string, string> = {};
      req.headers.forEach((value, key) => {
        headers[key.toLowerCase()] = value;
      });
      const identity = strategy.extractIdentity(headers);

      // --- Auth branching ---
      if (strategy.redirectRequiresAuth && !identity) {
        // Corporate mode: must be authenticated
        return { status: 401, body: "Unauthorized" };
      }

      // --- Parse incoming query params and fragment ---
      const incomingUrl = new URL(req.url);
      const incomingQuery = new URLSearchParams(incomingUrl.search);
      const incomingFragment: string | null = incomingUrl.hash
        ? incomingUrl.hash
        : null;

      // --- Look up aliases ---
      let privateAlias: AliasRecord | undefined;
      let globalAlias: AliasRecord | undefined;

      try {
        if (identity) {
          // Authenticated: look up both private and global
          const privateId = `${alias}:${identity.email}`;
          [privateAlias, globalAlias] = await Promise.all([
            getAliasByPartition(alias, privateId),
            getAliasByPartition(alias, alias),
          ]);
        } else {
          // Unauthenticated (redirectRequiresAuth is false): only global lookup
          globalAlias = await getAliasByPartition(alias, alias);
        }
      } catch (err: any) {
        context.error("Database error during alias lookup:", err);
        return {
          status: 500,
          body: "An internal error occurred. Please try again later.",
        };
      }

      // --- For unauthenticated users, filter out private global aliases ---
      if (!identity && globalAlias?.is_private) {
        globalAlias = undefined;
      }

      const now = new Date();

      // --- Determine which record(s) matched ---
      const hasPrivate = !!privateAlias;
      const hasGlobal = !!globalAlias;

      // Check expiry on matched records — treat expired records as non-existent
      const privateExpired = privateAlias?.expiry_status === "expired";
      const globalExpired = globalAlias?.expiry_status === "expired";

      const effectivePrivate = hasPrivate && !privateExpired;
      const effectiveGlobal = hasGlobal && !globalExpired;

      // If both exist but both are expired, return expired redirect
      if (hasPrivate && hasGlobal && privateExpired && globalExpired) {
        return {
          status: 302,
          headers: {
            location: `/_/?expired=${encodeURIComponent(alias)}`,
          },
        };
      }

      // If only match(es) are expired, return expired redirect
      if (
        (hasPrivate && !hasGlobal && privateExpired) ||
        (!hasPrivate && hasGlobal && globalExpired)
      ) {
        return {
          status: 302,
          headers: {
            location: `/_/?expired=${encodeURIComponent(alias)}`,
          },
        };
      }

      // --- Neither found ---
      if (!effectivePrivate && !effectiveGlobal) {
        return {
          status: 302,
          headers: {
            location: `/_/?suggest=${encodeURIComponent(alias)}`,
          },
        };
      }

      // --- Both found (interstitial) ---
      if (effectivePrivate && effectiveGlobal) {
        const privateDestination = mergeUrls(
          privateAlias!.destination_url,
          incomingQuery,
          incomingFragment,
        );
        const globalDestination = mergeUrls(
          globalAlias!.destination_url,
          incomingQuery,
          incomingFragment,
        );

        const interstitialUrl =
          `/_/interstitial?alias=${encodeURIComponent(alias)}` +
          `&privateUrl=${encodeURIComponent(privateDestination)}` +
          `&globalUrl=${encodeURIComponent(globalDestination)}`;

        return {
          status: 302,
          headers: { location: interstitialUrl },
        };
      }

      // --- Single match: redirect ---
      const matchedRecord = effectivePrivate ? privateAlias! : globalAlias!;
      const destination = mergeUrls(
        matchedRecord.destination_url,
        incomingQuery,
        incomingFragment,
      );

      // Fire-and-forget side effects (analytics + inactivity reset)
      try {
        await applyRedirectSideEffects(matchedRecord, now);
      } catch (err: any) {
        context.error("Failed to update analytics:", err);
      }

      return {
        status: 302,
        headers: { location: destination },
      };
    } catch (err: any) {
      context.error("Unexpected error in redirect handler:", err);
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

export function registerRedirect(strategy: AuthStrategy): void {
  app.http("redirect", {
    methods: ["GET"],
    authLevel: "anonymous",
    route: "{alias}",
    handler: createRedirectHandler(strategy),
  });
}
