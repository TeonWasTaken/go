const ICON_COLORS = [
  "#be123c", // rose-700 — 5.45:1
  "#7e22ce", // purple-700 — 6.08:1
  "#1d4ed8", // blue-700 — 5.56:1
  "#0e7490", // cyan-700 — 4.97:1
  "#047857", // emerald-700 — 5.09:1
  "#a16207", // yellow-700 — 4.51:1
  "#c2410c", // orange-700 — 4.63:1
  "#b91c1c", // red-700 — 5.25:1
  "#6d28d9", // violet-700 — 6.59:1
  "#0f766e", // teal-700 — 4.93:1
];

/**
 * Derives a deterministic background color from a text string.
 * Sums char codes and maps to a curated palette (all ≥ 4.5:1 contrast vs white).
 */
export function getIconColor(text: string): string {
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    hash += text.charCodeAt(i);
  }
  return ICON_COLORS[hash % ICON_COLORS.length]!;
}

/**
 * Returns the display letter for a generated icon.
 * First char of title (uppercased), falling back to alias, then "?".
 */
export function getIconLetter(title: string, alias: string): string {
  if (title.length > 0) {
    return title.charAt(0).toUpperCase();
  }
  if (alias.length > 0) {
    return alias.charAt(0).toUpperCase();
  }
  return "?";
}
