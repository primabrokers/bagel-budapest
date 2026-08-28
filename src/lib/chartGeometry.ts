/**
 * Pure geometry/number maths behind this app's dependency-free SVG charts (see CLAUDE.md's
 * "no chart library" rule and the plan's §3.8). `DonutChart` and `HBarGroup`
 * (components/charts/) are the only callers — everything here is plain arithmetic, no DOM, no
 * React, so it is fully covered by `chartGeometry.test.ts` without a rendering harness.
 */

/**
 * A point on a circle of the given radius, at `angleDeg` measured CLOCKWISE from 12 o'clock —
 * the way a clock face (and every design tool's angle picker) reads, rather than maths' usual
 * counter-clockwise-from-3-o'clock convention. SVG's y-axis already points down, which is what
 * makes the plain `sin`/`-cos` pair below trace clockwise without any extra sign-flipping.
 */
function polarToCartesian(cx: number, cy: number, radius: number, angleDeg: number): { x: number; y: number } {
  const angleRad = (angleDeg * Math.PI) / 180;
  return {
    x: cx + radius * Math.sin(angleRad),
    y: cy - radius * Math.cos(angleRad),
  };
}

/**
 * An SVG path `d` string tracing the arc of a circle (radius `radius`, centred on `cx,cy`) from
 * `startAngle` to `endAngle` degrees, clockwise from 12 o'clock. This is the ARC ONLY — no
 * `M cx,cy` line back to the centre and no closing `Z` — because `DonutChart` draws each
 * category as a stroked ring segment (`stroke-width` gives it thickness, `fill="none"`), the
 * standard dependency-free technique for an SVG donut. A caller wanting a filled pie WEDGE
 * instead can still use this path: prefix it with `M {cx} {cy} L` and suffix `Z`.
 *
 * Handles the one genuine gotcha in arc maths: a single `<path>` `A` command cannot draw a full
 * circle — start and end points coincide, so most renderers draw nothing at all. A sweep of
 * (near) 360° is split into two half-circle arcs instead, which always renders.
 */
export function describeArc(cx: number, cy: number, radius: number, startAngle: number, endAngle: number): string {
  const sweep = endAngle - startAngle;

  if (Math.abs(sweep) >= 359.99) {
    const direction = sweep >= 0 ? 1 : -1;
    const mid = startAngle + 180 * direction;
    return [
      describeArc(cx, cy, radius, startAngle, mid),
      describeArc(cx, cy, radius, mid, endAngle),
    ].join(' ');
  }

  const start = polarToCartesian(cx, cy, radius, startAngle);
  const end = polarToCartesian(cx, cy, radius, endAngle);
  // > 180°, the arc is the "long way round" — SVG's large-arc-flag.
  const largeArcFlag = Math.abs(sweep) > 180 ? 1 : 0;
  // Positive sweep = clockwise = SVG's sweep-flag 1, given polarToCartesian's own clockwise
  // convention above.
  const sweepFlag = sweep >= 0 ? 1 : 0;

  return `M ${start.x} ${start.y} A ${radius} ${radius} 0 ${largeArcFlag} ${sweepFlag} ${end.x} ${end.y}`;
}

/**
 * Human-friendly axis tick values spanning at least [min, max], the classic "nice numbers for
 * graph labels" algorithm (Heckbert): pick a round step (1/2/5 × a power of ten) close to the
 * range divided by the target count, then floor/ceil the domain to that step. `targetCount` is
 * the number of INTERVALS asked for, not a hard cap on the returned array's length — the
 * ceil/floor at the edges can add one more tick than that, which is normal for this algorithm and
 * always still a round number.
 *
 * `HBarGroup` uses this for its shared axis: `niceTicks(0, maxValue, 5)` reliably lands on
 * numbers like 0/20/40/60/80/100 rather than the raw data's own ugly maximum.
 */
export function niceTicks(min: number, max: number, targetCount = 5): number[] {
  if (!Number.isFinite(min) || !Number.isFinite(max) || targetCount < 1) return [];
  if (min === max) return [min];

  const lo = Math.min(min, max);
  const hi = Math.max(min, max);
  const range = niceNumber(hi - lo, false);
  const step = niceNumber(range / Math.max(targetCount - 1, 1), true);

  const niceMin = Math.floor(lo / step) * step;
  const niceMax = Math.ceil(hi / step) * step;

  const count = Math.round((niceMax - niceMin) / step);
  const ticks: number[] = [];
  for (let i = 0; i <= count; i++) {
    ticks.push(roundToStep(niceMin + i * step, step));
  }
  return ticks;
}

/** Rounds `value` to a "nice" 1/2/5×10^n neighbour — up (`round: false`, for sizing the overall
 *  range) or to the nearest (`round: true`, for picking the step itself). */
function niceNumber(value: number, round: boolean): number {
  const exponent = Math.floor(Math.log10(value));
  const fraction = value / 10 ** exponent;
  let niceFraction: number;

  if (round) {
    if (fraction < 1.5) niceFraction = 1;
    else if (fraction < 3) niceFraction = 2;
    else if (fraction < 7) niceFraction = 5;
    else niceFraction = 10;
  } else {
    if (fraction <= 1) niceFraction = 1;
    else if (fraction <= 2) niceFraction = 2;
    else if (fraction <= 5) niceFraction = 5;
    else niceFraction = 10;
  }

  return niceFraction * 10 ** exponent;
}

/** Snaps a computed tick back onto the step's own grid, so float drift (`0.30000000000000004`)
 *  never reaches the axis. */
function roundToStep(value: number, step: number): number {
  const decimals = Math.max(0, 6 - Math.floor(Math.log10(step)));
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}
