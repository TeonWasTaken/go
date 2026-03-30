import { describe, expect, it } from "vitest";
import { mergeUrls } from "../../src/shared/url-utils.js";

describe("mergeUrls", () => {
  it("returns destination URL unchanged when no incoming params or fragment", () => {
    const result = mergeUrls(
      "https://example.com/page",
      new URLSearchParams(),
      null,
    );
    expect(result).toBe("https://example.com/page");
  });

  it("appends incoming query params to destination without params", () => {
    const result = mergeUrls(
      "https://example.com/page",
      new URLSearchParams("a=1&b=2"),
      null,
    );
    expect(result).toBe("https://example.com/page?a=1&b=2");
  });

  it("destination query params take precedence for duplicate keys", () => {
    const result = mergeUrls(
      "https://example.com/page?a=dest",
      new URLSearchParams("a=incoming&b=2"),
      null,
    );
    const url = new URL(result);
    expect(url.searchParams.get("a")).toBe("dest");
    expect(url.searchParams.get("b")).toBe("2");
  });

  it("uses incoming fragment when destination has none", () => {
    const result = mergeUrls(
      "https://example.com/page",
      new URLSearchParams(),
      "section1",
    );
    expect(result).toBe("https://example.com/page#section1");
  });

  it("destination fragment takes precedence over incoming", () => {
    const result = mergeUrls(
      "https://example.com/page#destfrag",
      new URLSearchParams(),
      "incomingfrag",
    );
    expect(result).toBe("https://example.com/page#destfrag");
  });

  it("handles both query params and fragment independently", () => {
    const result = mergeUrls(
      "https://example.com/page?x=1",
      new URLSearchParams("y=2"),
      "frag",
    );
    const url = new URL(result);
    expect(url.searchParams.get("x")).toBe("1");
    expect(url.searchParams.get("y")).toBe("2");
    expect(url.hash).toBe("#frag");
  });

  it("preserves destination fragment when both query and fragment merge", () => {
    const result = mergeUrls(
      "https://example.com/page?a=1#destfrag",
      new URLSearchParams("b=2"),
      "incomingfrag",
    );
    const url = new URL(result);
    expect(url.searchParams.get("a")).toBe("1");
    expect(url.searchParams.get("b")).toBe("2");
    expect(url.hash).toBe("#destfrag");
  });
});
