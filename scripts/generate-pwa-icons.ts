/**
 * Generate PWA icon PNGs from favicon.svg using sharp.
 *
 * Usage: npx tsx scripts/generate-pwa-icons.ts
 *
 * Produces:
 *   public/pwa-192x192.png
 *   public/pwa-512x512.png
 *
 * The icons render the Go logo (dark variant — light text) centered
 * on a rounded-rect-style solid background matching the PWA theme color.
 */

import { readFileSync, writeFileSync } from "fs";
import { dirname, resolve } from "path";
import sharp from "sharp";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const THEME_COLOR = "#0ea5e9";
const SIZES = [192, 512] as const;

// Build an SVG that composites the logo on a solid background
function buildIconSvg(size: number): Buffer {
  // Padding: 15% on each side so the logo doesn't touch the edges
  const padding = Math.round(size * 0.15);
  const logoSize = size - padding * 2;

  // Read the original SVG and force the dark-mode colors (light logo on dark bg)
  let logoSvg = readFileSync(resolve(__dirname, "../public/favicon.svg"), "utf-8");

  // Strip the media query and force light (white) fills for both paths
  logoSvg = logoSvg
    .replace(/<style>[\s\S]*?<\/style>/, "")
    .replace(/class="primary"/g, 'fill="rgba(255,255,255,0.95)"')
    .replace(/class="secondary"/g, 'fill="rgba(255,255,255,0.7)"');

  // Wrap in a sized SVG with the theme background
  const wrapper = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" rx="${Math.round(size * 0.18)}" fill="${THEME_COLOR}"/>
  <svg x="${padding}" y="${padding}" width="${logoSize}" height="${logoSize}" viewBox="0 0 548 280">
    ${logoSvg.replace(/<\/?svg[^>]*>/g, "")}
  </svg>
</svg>`;

  return Buffer.from(wrapper);
}

async function main() {
  for (const size of SIZES) {
    const svgBuffer = buildIconSvg(size);
    const pngBuffer = await sharp(svgBuffer).resize(size, size).png().toBuffer();
    const outPath = resolve(__dirname, `../public/pwa-${size}x${size}.png`);
    writeFileSync(outPath, pngBuffer);
    console.log(`✓ ${outPath} (${pngBuffer.length} bytes)`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
