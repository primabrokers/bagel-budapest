import { describe, expect, it } from 'vitest';
import { describeArc, niceTicks } from './chartGeometry';

/** Parses one or more `M x y A r r 0 largeArc sweep x y` commands out of a `describeArc` path
 *  string (a full-circle sweep returns two, joined by a space) into plain numbers, so tests can
 *  assert on coordinates with `toBeCloseTo` rather than fighting trig's own floating-point noise
 *  (`Math.cos(Math.PI)` is `-1` exactly, but `Math.sin(Math.PI)` is `1.2246e-16`, not `0`). */
function parseArcs(d: string) {
  const NUM = '(-?\\d+(?:\\.\\d+)?(?:e-?\\d+)?)';
  const re = new RegExp(`M ${NUM} ${NUM} A ${NUM} ${NUM} 0 (\\d) (\\d) ${NUM} ${NUM}`, 'g');
  const arcs: {
    start: { x: number; y: number };
    radius: number;
    largeArc: number;
    sweepFlag: number;
    end: { x: number; y: number };
  }[] = [];
  let match: RegExpExecArray | null;
  while ((match = re.exec(d))) {
    arcs.push({
      start: { x: Number(match[1]), y: Number(match[2]) },
      radius: Number(match[3]),
      largeArc: Number(match[5]),
      sweepFlag: Number(match[6]),
      end: { x: Number(match[7]), y: Number(match[8]) },
    });
  }
  return arcs;
}

describe('describeArc', () => {
  it('traces a quarter circle clockwise from 12 o’clock to 3 o’clock', () => {
    const [arc] = parseArcs(describeArc(0, 0, 10, 0, 90));
    expect(arc.start.x).toBeCloseTo(0);
    expect(arc.start.y).toBeCloseTo(-10);
    expect(arc.end.x).toBeCloseTo(10);
    expect(arc.end.y).toBeCloseTo(0);
    expect(arc.radius).toBe(10);
    expect(arc.largeArc).toBe(0);
    expect(arc.sweepFlag).toBe(1); // clockwise
  });

  it('sets the large-arc flag once the sweep passes 180°, not before', () => {
    const under = parseArcs(describeArc(0, 0, 10, 0, 179))[0];
    expect(under.largeArc).toBe(0);
    const over = parseArcs(describeArc(0, 0, 10, 0, 181))[0];
    expect(over.largeArc).toBe(1);
  });

  it('reaches 9 o’clock going the long way round (270° clockwise)', () => {
    const [arc] = parseArcs(describeArc(0, 0, 10, 0, 270));
    expect(arc.end.x).toBeCloseTo(-10);
    expect(arc.end.y).toBeCloseTo(0);
    expect(arc.largeArc).toBe(1);
    expect(arc.sweepFlag).toBe(1);
  });

  it('flips the sweep flag for a counter-clockwise (negative) sweep', () => {
    const [arc] = parseArcs(describeArc(0, 0, 10, 90, 0));
    expect(arc.sweepFlag).toBe(0);
    expect(arc.start.x).toBeCloseTo(10);
    expect(arc.end.y).toBeCloseTo(-10);
  });

  it('is centred correctly away from the origin', () => {
    const [arc] = parseArcs(describeArc(50, 50, 20, 0, 90));
    expect(arc.start.x).toBeCloseTo(50);
    expect(arc.start.y).toBeCloseTo(30);
    expect(arc.end.x).toBeCloseTo(70);
    expect(arc.end.y).toBeCloseTo(50);
  });

  it('splits a full-circle sweep into two half-circle arcs that meet up', () => {
    const arcs = parseArcs(describeArc(0, 0, 10, 0, 360));
    expect(arcs).toHaveLength(2);
    // Starts at 12 o'clock...
    expect(arcs[0].start.x).toBeCloseTo(0);
    expect(arcs[0].start.y).toBeCloseTo(-10);
    // ...meets at 6 o'clock halfway round...
    expect(arcs[0].end.x).toBeCloseTo(0);
    expect(arcs[0].end.y).toBeCloseTo(10);
    expect(arcs[1].start.x).toBeCloseTo(0);
    expect(arcs[1].start.y).toBeCloseTo(10);
    // ...and back to 12 o'clock, a full turn later.
    expect(arcs[1].end.x).toBeCloseTo(0);
    expect(arcs[1].end.y).toBeCloseTo(-10);
    // Neither half alone claims to be the "long way round".
    expect(arcs[0].largeArc).toBe(0);
    expect(arcs[1].largeArc).toBe(0);
  });

  it('also splits a full-circle sweep going counter-clockwise', () => {
    const arcs = parseArcs(describeArc(0, 0, 10, 0, -360));
    expect(arcs).toHaveLength(2);
    expect(arcs.every((a) => a.sweepFlag === 0)).toBe(true);
  });
});

describe('niceTicks', () => {
  it('picks round steps of 20 for a 0–100 domain', () => {
    expect(niceTicks(0, 100, 5)).toEqual([0, 20, 40, 60, 80, 100]);
  });

  it('rounds an untidy domain out to a clean range and step', () => {
    // 3–27 rounds the range itself out to 30 first, then steps by 10.
    expect(niceTicks(3, 27, 5)).toEqual([0, 10, 20, 30]);
  });

  it('handles a small domain the same way', () => {
    expect(niceTicks(0, 9, 5)).toEqual([0, 2, 4, 6, 8, 10]);
  });

  it('is symmetric across negative and positive values', () => {
    expect(niceTicks(-50, 50, 5)).toEqual([-60, -40, -20, 0, 20, 40, 60]);
  });

  it('every tick is a clean number, never a float artefact', () => {
    for (const tick of niceTicks(0, 12345, 6)) {
      // A round-tripped nice number never carries the kind of long tail
      // (0.30000000000000004) that raw float division produces.
      expect(tick).toBe(Number(tick.toFixed(6)));
    }
  });

  it('returns the single value when min and max are equal', () => {
    expect(niceTicks(5, 5)).toEqual([5]);
  });

  it('works regardless of argument order', () => {
    expect(niceTicks(100, 0, 5)).toEqual(niceTicks(0, 100, 5));
  });

  it('returns nothing for a non-positive target count or non-finite input', () => {
    expect(niceTicks(0, 100, 0)).toEqual([]);
    expect(niceTicks(NaN, 100)).toEqual([]);
    expect(niceTicks(0, Infinity)).toEqual([]);
  });
});
