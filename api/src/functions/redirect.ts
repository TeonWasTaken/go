/**
 * Redirect Azure Function — GET /:alias
 *
 * Resolves an alias to its destination URL and performs an HTTP 302 redirect.
 * Handles private-first resolution, interstitial conflict pages, expiry checks,
 * analytics updates (click_count, last_accessed_at, heat_score), inactivity
 * expiry resets, and query string / fragment passthrough.
 */

import {
  app,
  HttpRequest,
  HttpResponseInit,
  InvocationContext,
} from "@azure/functions";
import { createAuthProvider } from "../shared/auth-provider.js";
import { getAliasByPartition, updateAlias } from "../shared/cosmos-client.js";
import { computeHeatScore } from "../shared/heat-utils.js";
import { AliasRecord } from "../shared/models.js";
import { mergeUrls } from "../shared/url-utils.js";

// ---------------------------------------------------------------------------
// Interstitial HTML template
// ---------------------------------------------------------------------------

function buildInterstitialHtml(
  alias: string,
  privateUrl: string,
  globalUrl: string,
): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>go/${alias} — Choose Destination</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Inter', system-ui, -apple-system, sans-serif;
      min-height: 100vh;
      display: flex; align-items: center; justify-content: center;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: #1a1a2e;
    }
    .card {
      background: rgba(255,255,255,0.15);
      backdrop-filter: blur(12px);
      -webkit-backdrop-filter: blur(12px);
      border: 1px solid rgba(255,255,255,0.25);
      border-radius: 16px;
      padding: 2.5rem;
      max-width: 520px;
      width: 90%;
      text-align: center;
      color: #fff;
    }
    h1 { font-size: 1.4rem; margin-bottom: 0.5rem; }
    .subtitle { font-size: 0.9rem; opacity: 0.85; margin-bottom: 1.5rem; }
    .option {
      display: block;
      padding: 0.9rem 1.2rem;
      margin: 0.6rem 0;
      border-radius: 10px;
      text-decoration: none;
      font-weight: 500;
      transition: transform 0.15s, box-shadow 0.15s;
    }
    .option:hover { transform: translateY(-2px); box-shadow: 0 4px 12px rgba(0,0,0,0.2); }
    .option.private { background: rgba(255,255,255,0.25); color: #fff; }
    .option.global  { background: rgba(255,255,255,0.12); color: #fff; }
    .countdown { margin-top: 1.2rem; font-size: 0.85rem; opacity: 0.8; }
    @media (prefers-reduced-motion: reduce) {
      .option { transition: none; }
    }
  </style>
</head>
<body>
  <div class="card">
    <h1>go/${alias}</h1>
    <p class="subtitle">This alias exists as both a personal and a global link.</p>
    <a class="option private" id="private-link" href="${escapeHtml(privateUrl)}">
      Personal → ${escapeHtml(truncateUrl(privateUrl))}
    </a>
    <a class="option global" id="global-link" href="${escapeHtml(globalUrl)}">
      Global → ${escapeHtml(truncateUrl(globalUrl))}
    </a>
    <p class="countdown" id="countdown">Redirecting to your personal link in <span id="seconds">5</span>s…</p>
  </div>
  <script>
    let remaining = 5;
    const timer = setInterval(() => {
      remaining--;
      document.getElementById('seconds').textContent = remaining;
      if (remaining <= 0) {
        clearInterval(timer);
        window.location.href = ${JSON.stringify(privateUrl)};
      }
    }, 1000);
    document.querySelectorAll('.option').forEach(link => {
      link.addEventListener('click', () => clearInterval(timer));
    });
  </script>
</body>
</html>`;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function truncateUrl(url: string, max = 60): string {
  return url.length > max ? url.slice(0, max) + "…" : url;
}

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
// Main handler
// ---------------------------------------------------------------------------

export async function redirectHandler(
  req: HttpRequest,
  context: InvocationContext,
): Promise<HttpResponseInit> {
  try {
    // --- Extract alias from route param ---
    const rawAlias = req.params.alias;
    if (!rawAlias) {
      return { status: 302, headers: { location: "/" } };
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

    // --- Parse incoming query params and fragment ---
    const incomingUrl = new URL(req.url);
    const incomingQuery = new URLSearchParams(incomingUrl.search);
    // Remove the internal route params that Azure Functions may add
    // Fragment is not sent to the server, but we handle it if present
    const incomingFragment: string | null = incomingUrl.hash
      ? incomingUrl.hash
      : null;

    // --- Look up aliases ---
    const privateId = `${alias}:${identity.email}`;
    let privateAlias: AliasRecord | undefined;
    let globalAlias: AliasRecord | undefined;

    try {
      [privateAlias, globalAlias] = await Promise.all([
        getAliasByPartition(alias, privateId),
        getAliasByPartition(alias, alias),
      ]);
    } catch (err: any) {
      context.error("Database error during alias lookup:", err);
      return {
        status: 500,
        body: "An internal error occurred. Please try again later.",
      };
    }

    const now = new Date();

    // --- Determine which record(s) matched ---
    const hasPrivate = !!privateAlias;
    const hasGlobal = !!globalAlias;

    // Check expiry on matched records — treat expired records as non-existent
    // for resolution, but still return 410 if the only match is expired.
    const privateExpired = privateAlias?.expiry_status === "expired";
    const globalExpired = globalAlias?.expiry_status === "expired";

    const effectivePrivate = hasPrivate && !privateExpired;
    const effectiveGlobal = hasGlobal && !globalExpired;

    // If both exist but both are expired, return 410
    if (hasPrivate && hasGlobal && privateExpired && globalExpired) {
      return {
        status: 302,
        headers: {
          location: `/?expired=${encodeURIComponent(alias)}`,
        },
      };
    }

    // If only match(es) are expired, return 410 with dashboard redirect
    if (
      (hasPrivate && !hasGlobal && privateExpired) ||
      (!hasPrivate && hasGlobal && globalExpired)
    ) {
      return {
        status: 302,
        headers: {
          location: `/?expired=${encodeURIComponent(alias)}`,
        },
      };
    }

    // --- Neither found ---
    if (!effectivePrivate && !effectiveGlobal) {
      return {
        status: 302,
        headers: {
          location: `/?suggest=${encodeURIComponent(alias)}`,
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

      const html = buildInterstitialHtml(
        alias,
        privateDestination,
        globalDestination,
      );

      return {
        status: 200,
        headers: { "content-type": "text/html; charset=utf-8" },
        body: html,
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
      // Log but don't block the redirect
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
}

// ---------------------------------------------------------------------------
// Register the Azure Function
// ---------------------------------------------------------------------------

app.http("redirect", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "{alias}",
  handler: redirectHandler,
});
