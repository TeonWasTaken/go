// Feature: ui-ux-improvements, Property 4: WCAG AA contrast ratios on new background
import * as fc from "fast-check";
import { describe, expect, it } from "vitest";

/**
 * Validates: Requirements 4.7
 *
 * For all text color tokens and their corresponding background color tokens,
 * in both light and dark themes, compute contrast ratio and assert >= 4.5:1
 * for normal text per WCAG 2.0.
 */

// --- Theme color definitions from src/index.css ---

interface ThemeColorPair {
  theme: string;
  tokenName: string;
  textHex: string;
  bgHex: string;
}

const themeColorPairs: ThemeColorPair[] = [
  // Light theme
  {
    theme: "light",
    tokenName: "--color-text on --color-bg",
    textHex: "#1e293b",
    bgHex: "#e8eaed",
  },
  {
    theme: "light",
    tokenName: "--color-text-muted on --color-bg",
    textHex: "#4b5c6b",
    bgHex: "#e8eaed",
  },
  // Dark theme
  {
    theme: "dark",
    tokenName: "--color-text on --color-bg",
    textHex: "#e2e8f0",
    bgHex: "#1a1d23",
  },
  {
    theme: "dark",
    tokenName: "--color-text-muted on --color-bg",
    textHex: "#94a3b8",
    bgHex: "#1a1d23",
  },
];

// --- WCAG 2.0 contrast ratio computation ---

/** Parse a hex color string (#RRGGBB) into [r, g, b] in 0–255 range. */
function parseHex(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [
    parseInt(h.substring(0, 2), 16),
    parseInt(h.substring(2, 4), 16),
    parseInt(h.substring(4, 6), 16),
  ];
}

/**
 * Compute relative luminance per WCAG 2.0 formula.
 * https://www.w3.org/TR/WCAG20/#relativeluminancedef
 */
function relativeLuminance(hex: string): number {
  const [r, g, b] = parseHex(hex).map((c) => {
    const sRGB = c / 255;
    return sRGB <= 0.03928
      ? sRGB / 12.92
      : Math.pow((sRGB + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * Compute contrast ratio per WCAG 2.0 formula.
 * https://www.w3.org/TR/WCAG20/#contrast-ratiodef
 */
function contrastRatio(hex1: string, hex2: string): number {
  const l1 = relativeLuminance(hex1);
  const l2 = relativeLuminance(hex2);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

// --- Property test ---

describe("Property 4: WCAG AA contrast ratios on new background", () => {
  it("all text/background color pairs meet WCAG AA 4.5:1 minimum contrast ratio", () => {
    // Use fast-check to pick from all defined theme color pairs
    const pairArb = fc.constantFrom(...themeColorPairs);

    fc.assert(
      fc.property(pairArb, (pair) => {
        const ratio = contrastRatio(pair.textHex, pair.bgHex);
        expect(ratio).toBeGreaterThanOrEqual(4.5);
      }),
      { numRuns: 100 },
    );
  });

  it("reports actual contrast ratios for documentation", () => {
    // Deterministic check of each pair with exact ratio values
    for (const pair of themeColorPairs) {
      const ratio = contrastRatio(pair.textHex, pair.bgHex);
      expect(
        ratio,
        `${pair.theme} theme: ${pair.tokenName} has ratio ${ratio.toFixed(2)}:1, expected >= 4.5:1`,
      ).toBeGreaterThanOrEqual(4.5);
    }
  });
});
