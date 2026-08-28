/**
 * A fixed-order categorical palette drawn ENTIRELY from this app's own design tokens
 * (tailwind.config.ts) — never an invented hex, per CLAUDE.md's "use a token" rule (and the
 * lint config bans a raw `-[#hex]` literal outright).
 *
 * Checked against the dataviz colour-formula's validator using the actual token hex values
 * (plum-600 #72386B, success-fg #358D5E, danger-fg #D63A29, info-fg #3674A1): that four-colour
 * core passes CVD separation and the normal-vision floor outright. Extending to a fifth slot
 * (gold-600 #856823) lands two pairs in the 6–8 ΔE "floor" band the checker calls legal ONLY
 * with a visible secondary encoding — which is why every chart drawing from this palette also
 * ships a text legend (label + value) rather than ever relying on colour alone for identity.
 *
 * Both forms are spelled out here as literal strings so Tailwind's content scanner generates
 * both utilities — `stroke` for an SVG arc's `stroke="currentColor"`, `fill` for a legend swatch
 * or a filled bar — neither is ever built by template-interpolating a colour name at runtime.
 */
export interface ChartColour {
  stroke: string;
  fill: string;
}

export const CHART_PALETTE: ChartColour[] = [
  { stroke: 'text-plum-600', fill: 'bg-plum-600' },
  { stroke: 'text-success-fg', fill: 'bg-success-fg' },
  { stroke: 'text-danger-fg', fill: 'bg-danger-fg' },
  { stroke: 'text-info-fg', fill: 'bg-info-fg' },
  { stroke: 'text-gold-600', fill: 'bg-gold-600' },
];

/** The bucket anything beyond the fixed palette folds into — a neutral grey, per the dataviz
 *  "a 9th series is never a generated hue" rule, never a cycled-back repeat of an earlier
 *  colour. Also the default for a segment with no colour opinion of its own. */
export const CHART_OTHER_COLOUR: ChartColour = {
  stroke: 'text-separator-strong',
  fill: 'bg-separator-strong',
};

/** Deterministic string hash (djb2) — a stable fallback slot for a name outside `orderedKeys`
 *  (a family's own free-text category), so it still gets the same colour on every reload rather
 *  than one keyed to array position, which would shuffle as items are added or removed. */
function hashString(value: string): number {
  let hash = 5381;
  for (let i = 0; i < value.length; i++) hash = (hash * 33) ^ value.charCodeAt(i);
  return Math.abs(hash);
}

/**
 * A stable colour for a named entity (a category, a vendor) — keyed to its position in
 * `orderedKeys` when given, so colour follows the entity's IDENTITY rather than a chart's
 * current sort order (a category keeps its colour whether the chart lists it by value or
 * alphabetically), or to a hash of its own name when the caller has no canonical order to key
 * against (a vendor name, a category typed outside the curated list).
 */
export function chartColourFor(key: string, orderedKeys?: readonly string[]): ChartColour {
  const idx = orderedKeys ? orderedKeys.indexOf(key) : -1;
  const slot = idx >= 0 ? idx : hashString(key);
  return CHART_PALETTE[slot % CHART_PALETTE.length];
}
