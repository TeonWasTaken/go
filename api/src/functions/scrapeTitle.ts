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

    // Extract icon: check <link rel="icon"> or <link rel="shortcut icon">
    const iconMatch =
      html.match(
        /<link[^>]*rel=["'](?:shortcut )?icon["'][^>]*href=["']([^"']+)["']/i,
      ) ||
      html.match(
        /<link[^>]*href=["']([^"']+)["'][^>]*rel=["'](?:shortcut )?icon["']/i,
      );

    let iconUrl = "";
    if (iconMatch) {
      iconUrl = iconMatch[1];
      // Resolve relative URLs
      if (iconUrl.startsWith("/")) {
        const base = new URL(url);
        iconUrl = `${base.origin}${iconUrl}`;
      } else if (!iconUrl.startsWith("http")) {
        const base = new URL(url);
        iconUrl = `${base.origin}/${iconUrl}`;
      }
    } else {
      // Fall back to /favicon.ico
      const base = new URL(url);
      iconUrl = `${base.origin}/favicon.ico`;
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
