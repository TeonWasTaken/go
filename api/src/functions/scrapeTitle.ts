/**
 * GET /api/scrape-title Azure Function
 *
 * Fetches a target URL, extracts the <title> tag and favicon/icon URL
 * from the HTML, and returns them as JSON. Returns empty strings on
 * any error. This is a utility endpoint that does not require
 * authentication.
 */

import {
  app,
  HttpRequest,
  HttpResponseInit,
  InvocationContext,
} from "@azure/functions";

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

export async function scrapeTitleHandler(
  req: HttpRequest,
  _context: InvocationContext,
): Promise<HttpResponseInit> {
  const url = req.query.get("url");
  if (!url) {
    return { status: 400, jsonBody: { error: "url parameter required" } };
  }

  try {
    const response = await fetch(url, {
      headers: { "User-Agent": "GoLinkBot/1.0" },
      signal: AbortSignal.timeout(5000),
    });
    const html = await response.text();

    // Extract <title> content
    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);

    // Extract icon: prefer high-res sources
    // 1. Apple touch icon (typically 180×180)
    const appleTouchMatch =
      html.match(
        /<link[^>]*rel=["']apple-touch-icon["'][^>]*href=["']([^"']+)["']/i,
      ) ||
      html.match(
        /<link[^>]*href=["']([^"']+)["'][^>]*rel=["']apple-touch-icon["']/i,
      );

    // 2. Standard favicon from HTML
    const iconMatch =
      html.match(
        /<link[^>]*rel=["'](?:shortcut )?icon["'][^>]*href=["']([^"']+)["']/i,
      ) ||
      html.match(
        /<link[^>]*href=["']([^"']+)["'][^>]*rel=["'](?:shortcut )?icon["']/i,
      );

    const rawIcon = appleTouchMatch?.[1] ?? iconMatch?.[1] ?? null;

    let iconUrl = "";
    if (rawIcon) {
      iconUrl = rawIcon;
      // Resolve relative URLs
      if (iconUrl.startsWith("/")) {
        const base = new URL(url);
        iconUrl = `${base.origin}${iconUrl}`;
      } else if (!iconUrl.startsWith("http")) {
        const base = new URL(url);
        iconUrl = `${base.origin}/${iconUrl}`;
      }
    } else {
      // Fall back to Google's high-res favicon service (returns up to 256px)
      const base = new URL(url);
      iconUrl = `https://www.google.com/s2/favicons?domain=${encodeURIComponent(base.hostname)}&sz=64`;
    }

    return {
      jsonBody: { title: titleMatch ? titleMatch[1].trim() : "", iconUrl },
    };
  } catch {
    return { jsonBody: { title: "", iconUrl: "" } };
  }
}

// ---------------------------------------------------------------------------
// Register the Azure Function
// ---------------------------------------------------------------------------

app.http("scrapeTitle", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "api/scrape-title",
  handler: scrapeTitleHandler,
});
