import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { mergeUrls } from "../../src/shared/url-utils.js";

// --- Generators ---

/** Alphanumeric key suitable for query params */
const queryKeyArb = fc.stringOf(
  fc.constantFrom(..."abcdefghijklmnopqrstuvwxyz0123456789".split("")),
  { minLength: 1, maxLength: 8 },
);

/** Simple query param value */
const queryValueArb = fc.stringOf(
  fc.constantFrom(..."abcdefghijklmnopqrstuvwxyz0123456789-_.".split("")),
  { minLength: 1, maxLength: 12 },
);

/** A set of unique query param entries */
const queryParamsArb = fc
  .uniqueArray(fc.tuple(queryKeyArb, queryValueArb), {
    minLength: 0,
    maxLength: 6,
    selector: ([k]) => k,
  })
  .map((entries) => new URLSearchParams(entries));

/** A simple fragment string (no leading #) */
const fragmentArb = fc.stringOf(
  fc.constantFrom(..."abcdefghijklmnopqrstuvwxyz0123456789-_".split("")),
  { minLength: 1, maxLength: 10 },
);

/** A valid destination URL with optional query params and fragment */
const destinationUrlArb = fc
  .tuple(
    fc.constantFrom(
      "https://example.com",
      "https://app.test.io",
      "https://docs.internal.co",
    ),
    fc.constantFrom("/page", "/a/b", "/resource", ""),
    fc.option(
      fc.uniqueArray(fc.tuple(queryKeyArb, queryValueArb), {
        minLength: 1,
        maxLength: 4,
        selector: ([k]) => k,
      }),
      { nil: undefined },
    ),
    fc.option(fragmentArb, { nil: undefined }),
  )
  .map(([origin, path, queryEntries, frag]) => {
    let url = `${origin}${path}`;
    if (queryEntries) {
      url += `?${new URLSearchParams(queryEntries).toString()}`;
    }
    if (frag) {
      url += `#${frag}`;
    }
    return url;
  });

// Feature: go-url-alias-service, Property 2: URL merging preserves destination precedence
describe("Property 2: URL merging preserves destination precedence", () => {
  /**
   * **Validates: Requirements 1.12, 1.13, 1.14**
   *
   * For any destination URL, any set of incoming query parameters, and any
   * incoming fragment:
   * - All incoming query parameters appear in the final URL unless overridden
   *   by a destination parameter with the same key
   * - The destination's query parameters take precedence for duplicate keys
   * - The destination's fragment takes precedence over the incoming fragment
   * - Query string and fragment handling are independent of each other
   */

  it("all incoming query params appear in the result unless overridden by destination", () => {
    fc.assert(
      fc.property(destinationUrlArb, queryParamsArb, (destUrl, incoming) => {
        const result = mergeUrls(destUrl, incoming, null);
        const resultUrl = new URL(result);
        const destParams = new URL(destUrl).searchParams;

        for (const [key, value] of incoming) {
          // The key must exist in the result
          expect(resultUrl.searchParams.has(key)).toBe(true);
          // If destination doesn't have this key, incoming value is preserved
          if (!destParams.has(key)) {
            expect(resultUrl.searchParams.get(key)).toBe(value);
          }
        }
      }),
      { numRuns: 200 },
    );
  });

  it("destination query params always take precedence for duplicate keys", () => {
    fc.assert(
      fc.property(destinationUrlArb, queryParamsArb, (destUrl, incoming) => {
        const result = mergeUrls(destUrl, incoming, null);
        const resultUrl = new URL(result);
        const destParams = new URL(destUrl).searchParams;

        for (const [key, value] of destParams) {
          expect(resultUrl.searchParams.get(key)).toBe(value);
        }
      }),
      { numRuns: 200 },
    );
  });

  it("destination fragment takes precedence over incoming fragment", () => {
    fc.assert(
      fc.property(destinationUrlArb, fragmentArb, (destUrl, incomingFrag) => {
        const result = mergeUrls(destUrl, new URLSearchParams(), incomingFrag);
        const resultUrl = new URL(result);
        const destHash = new URL(destUrl).hash;

        if (destHash) {
          expect(resultUrl.hash).toBe(destHash);
        } else {
          expect(resultUrl.hash).toBe(`#${incomingFrag}`);
        }
      }),
      { numRuns: 200 },
    );
  });

  it("query string and fragment handling are independent", () => {
    fc.assert(
      fc.property(
        destinationUrlArb,
        queryParamsArb,
        fc.option(fragmentArb, { nil: null }),
        (destUrl, incoming, incomingFrag) => {
          // Merge with both query and fragment
          const resultBoth = mergeUrls(destUrl, incoming, incomingFrag);
          // Merge with only query (no fragment)
          const resultQueryOnly = mergeUrls(destUrl, incoming, null);
          // Merge with only fragment (no query)
          const resultFragOnly = mergeUrls(
            destUrl,
            new URLSearchParams(),
            incomingFrag,
          );

          const urlBoth = new URL(resultBoth);
          const urlQueryOnly = new URL(resultQueryOnly);
          const urlFragOnly = new URL(resultFragOnly);

          // Query params from combined merge should match query-only merge
          expect(urlBoth.search).toBe(urlQueryOnly.search);
          // Fragment from combined merge should match fragment-only merge
          expect(urlBoth.hash).toBe(urlFragOnly.hash);
        },
      ),
      { numRuns: 200 },
    );
  });

  it("result is always a valid URL", () => {
    fc.assert(
      fc.property(
        destinationUrlArb,
        queryParamsArb,
        fc.option(fragmentArb, { nil: null }),
        (destUrl, incoming, incomingFrag) => {
          const result = mergeUrls(destUrl, incoming, incomingFrag);
          expect(() => new URL(result)).not.toThrow();
        },
      ),
      { numRuns: 200 },
    );
  });
});
