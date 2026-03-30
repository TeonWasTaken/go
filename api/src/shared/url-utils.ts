/**
 * Merges incoming query parameters and fragment with a destination URL.
 *
 * Merge rules:
 * - Query params: incoming params are merged into the destination URL;
 *   destination params take precedence for duplicate keys.
 * - Fragment: destination fragment takes precedence; incoming fragment
 *   is used only when the destination has none.
 * - Query string and fragment handling are independent.
 */
export function mergeUrls(
  destinationUrl: string,
  incomingQuery: URLSearchParams,
  incomingFragment: string | null,
): string {
  const url = new URL(destinationUrl);

  // Merge query params: incoming first, then destination overwrites duplicates
  const merged = new URLSearchParams();

  for (const [key, value] of incomingQuery) {
    merged.set(key, value);
  }
  for (const [key, value] of url.searchParams) {
    merged.set(key, value);
  }

  url.search = merged.size > 0 ? `?${merged.toString()}` : "";

  // Fragment: destination takes precedence
  if (!url.hash && incomingFragment) {
    url.hash = incomingFragment;
  }

  return url.toString();
}
