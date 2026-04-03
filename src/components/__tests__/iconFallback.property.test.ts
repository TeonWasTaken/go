// Feature: icon-fallback, Properties 1–6
import { cleanup, render } from "@testing-library/react";
import * as fc from "fast-check";
import { createElement } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { IconFallback } from "../IconFallback";
import { getIconColor, getIconLetter } from "../iconFallbackUtils";

afterEach(() => {
  cleanup();
});

// --- WCAG 2.0 contrast helpers ---

function parseHex(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [
    parseInt(h.substring(0, 2), 16),
    parseInt(h.substring(2, 4), 16),
    parseInt(h.substring(4, 6), 16),
  ];
}

function relativeLuminance(hex: string): number {
  const channels = parseHex(hex).map((c) => {
    const sRGB = c / 255;
    return sRGB <= 0.03928
      ? sRGB / 12.92
      : Math.pow((sRGB + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * channels[0]! + 0.7152 * channels[1]! + 0.0722 * channels[2]!;
}

function contrastRatio(hex1: string, hex2: string): number {
  const l1 = relativeLuminance(hex1);
  const l2 = relativeLuminance(hex2);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

// --- Arbitraries ---

const nonEmptyStringArb = fc.string({ minLength: 1 });
const sizeArb = fc.integer({ min: 1, max: 500 });

/**
 * Validates: Requirements 1.3, 1.4
 *
 * For any non-empty title and any alias, getIconLetter returns the first
 * character of title uppercased. For empty title and non-empty alias, returns
 * first character of alias uppercased.
 */
describe("Property 1: Icon letter derivation", () => {
  it("returns first char of title (uppercased) when title is non-empty", () => {
    fc.assert(
      fc.property(nonEmptyStringArb, fc.string(), (title, alias) => {
        const result = getIconLetter(title, alias);
        expect(result).toBe(title.charAt(0).toUpperCase());
      }),
      { numRuns: 100 },
    );
  });

  it("returns first char of alias (uppercased) when title is empty and alias is non-empty", () => {
    fc.assert(
      fc.property(nonEmptyStringArb, (alias) => {
        const result = getIconLetter("", alias);
        expect(result).toBe(alias.charAt(0).toUpperCase());
      }),
      { numRuns: 100 },
    );
  });
});

/**
 * Validates: Requirements 3.1, 3.2
 *
 * For any title string, calling getIconColor multiple times returns the same result.
 */
describe("Property 2: Icon color determinism", () => {
  it("getIconColor returns the same color for the same input on repeated calls", () => {
    fc.assert(
      fc.property(fc.string(), (title) => {
        const color1 = getIconColor(title);
        const color2 = getIconColor(title);
        expect(color1).toBe(color2);
      }),
      { numRuns: 100 },
    );
  });
});

/**
 * Validates: Requirements 3.4
 *
 * For any title string, the color returned by getIconColor paired with white
 * (#FFFFFF) text must have a contrast ratio of at least 4.5:1 per WCAG 2.0.
 */
describe("Property 3: WCAG AA contrast", () => {
  it("all generated colors have >= 4.5:1 contrast ratio vs white", () => {
    fc.assert(
      fc.property(fc.string(), (title) => {
        const bgColor = getIconColor(title);
        const ratio = contrastRatio(bgColor, "#FFFFFF");
        expect(ratio).toBeGreaterThanOrEqual(4.5);
      }),
      { numRuns: 100 },
    );
  });
});

/**
 * Validates: Requirements 2.2, 4.3
 *
 * For any positive integer size, when IconFallback renders a generated icon
 * (no iconUrl), the rendered element's width and height match the size prop.
 */
describe("Property 4: Size prop dimensions", () => {
  it("rendered element matches provided size", () => {
    fc.assert(
      fc.property(
        sizeArb,
        nonEmptyStringArb,
        fc.string(),
        (size, title, alias) => {
          const { container } = render(
            createElement(IconFallback, { iconUrl: null, title, alias, size }),
          );
          const el = container.firstElementChild as HTMLElement;
          expect(el.style.width).toBe(`${size}px`);
          expect(el.style.height).toBe(`${size}px`);
          cleanup();
        },
      ),
      { numRuns: 100 },
    );
  });
});

/**
 * Validates: Requirements 1.1, 2.1
 *
 * When iconUrl is null or empty, no <img> element is rendered.
 */
describe("Property 5: Fallback rendering", () => {
  it("no <img> when iconUrl is null or empty", () => {
    const nullOrEmptyUrl = fc.constantFrom(null, "");
    fc.assert(
      fc.property(
        nullOrEmptyUrl,
        nonEmptyStringArb,
        fc.string(),
        sizeArb,
        (iconUrl, title, alias, size) => {
          const { container } = render(
            createElement(IconFallback, { iconUrl, title, alias, size }),
          );
          expect(container.querySelector("img")).toBeNull();
          cleanup();
        },
      ),
      { numRuns: 100 },
    );
  });
});

/**
 * Validates: Requirements 5.1, 5.2
 *
 * Generated icon has aria-hidden="true" and no tabIndex attribute.
 */
describe("Property 6: Accessibility", () => {
  it("generated icon has aria-hidden='true' and no tabIndex", () => {
    fc.assert(
      fc.property(
        nonEmptyStringArb,
        fc.string(),
        sizeArb,
        (title, alias, size) => {
          const { container } = render(
            createElement(IconFallback, { iconUrl: null, title, alias, size }),
          );
          const el = container.firstElementChild as HTMLElement;
          expect(el.getAttribute("aria-hidden")).toBe("true");
          expect(el.hasAttribute("tabindex")).toBe(false);
          cleanup();
        },
      ),
      { numRuns: 100 },
    );
  });
});
