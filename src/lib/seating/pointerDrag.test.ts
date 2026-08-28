import { describe, expect, it } from 'vitest';
import {
  applyMatrix,
  dragNewPosition,
  identityMatrix,
  invertMatrix,
  localToScreen,
  screenToLocal,
  type MatrixLike,
} from './pointerDrag';

/** Asserts two matrices are equal field-by-field with `toBeCloseTo`, which (unlike `toEqual`'s
 *  `Object.is` comparison) treats `-0` and `0` as the same value — a legitimate `-0` shows up
 *  routinely below from negating an already-zero numerator, and is the same value for every
 *  purpose this matrix is ever used for. */
function expectMatrixCloseTo(actual: MatrixLike, expected: MatrixLike) {
  expect(actual.a).toBeCloseTo(expected.a);
  expect(actual.b).toBeCloseTo(expected.b);
  expect(actual.c).toBeCloseTo(expected.c);
  expect(actual.d).toBeCloseTo(expected.d);
  expect(actual.e).toBeCloseTo(expected.e);
  expect(actual.f).toBeCloseTo(expected.f);
}

describe('invertMatrix', () => {
  it('the identity matrix is its own inverse', () => {
    expectMatrixCloseTo(invertMatrix(identityMatrix()), identityMatrix());
  });

  it('inverts a pure scale', () => {
    const scale2x: MatrixLike = { a: 2, b: 0, c: 0, d: 2, e: 0, f: 0 };
    expectMatrixCloseTo(invertMatrix(scale2x), { a: 0.5, b: 0, c: 0, d: 0.5, e: 0, f: 0 });
  });

  it('inverts a pure translation', () => {
    const translate: MatrixLike = { a: 1, b: 0, c: 0, d: 1, e: 100, f: -50 };
    expectMatrixCloseTo(invertMatrix(translate), { a: 1, b: 0, c: 0, d: 1, e: -100, f: 50 });
  });

  it('composing a matrix with its own inverse yields the identity, for a translate+scale matrix', () => {
    const m: MatrixLike = { a: 0.4, b: 0, c: 0, d: 0.4, e: 50, f: 20 };
    const inv = invertMatrix(m);
    // Applying m then inv should return the original point.
    const point = { x: 37, y: -12 };
    const roundTripped = applyMatrix(inv, applyMatrix(m, point));
    expect(roundTripped.x).toBeCloseTo(point.x, 10);
    expect(roundTripped.y).toBeCloseTo(point.y, 10);
  });

  it('throws on a singular (non-invertible) matrix', () => {
    const singular: MatrixLike = { a: 0, b: 0, c: 0, d: 0, e: 0, f: 0 };
    expect(() => invertMatrix(singular)).toThrow();
  });
});

describe('applyMatrix', () => {
  it('the identity matrix leaves a point unchanged', () => {
    expect(applyMatrix(identityMatrix(), { x: 12, y: -8 })).toEqual({ x: 12, y: -8 });
  });

  it('a translation shifts the point by its own e/f', () => {
    const m: MatrixLike = { a: 1, b: 0, c: 0, d: 1, e: 10, f: 20 };
    expect(applyMatrix(m, { x: 5, y: 5 })).toEqual({ x: 15, y: 25 });
  });

  it('a scale multiplies the point', () => {
    const m: MatrixLike = { a: 3, b: 0, c: 0, d: 3, e: 0, f: 0 };
    expect(applyMatrix(m, { x: 2, y: 4 })).toEqual({ x: 6, y: 12 });
  });
});

describe('screenToLocal / localToScreen', () => {
  it('maps a screen point through a viewBox-style scale+offset, matching an SVG viewBox="0 0 2000 1500" shown at 800x600', () => {
    // 800/2000 = 0.4 = 600/1500, svg positioned flush at the screen origin.
    const ctm: MatrixLike = { a: 0.4, b: 0, c: 0, d: 0.4, e: 0, f: 0 };
    // The room's centre (1000, 750) should render at screen (400, 300).
    expect(localToScreen(ctm, 1000, 750)).toEqual({ x: 400, y: 300 });
    // toBeCloseTo, not toEqual: inverting 0.4 and multiplying back through picks up an
    // IEEE-754 rounding artefact (999.9999999999998), which is exact enough for placing a seat
    // on screen but not for a strict equality check.
    const local = screenToLocal(ctm, 400, 300);
    expect(local.x).toBeCloseTo(1000, 9);
    expect(local.y).toBeCloseTo(750, 9);
  });

  it('accounts for the svg element itself being offset on screen', () => {
    const ctm: MatrixLike = { a: 0.4, b: 0, c: 0, d: 0.4, e: 50, f: 50 };
    // Screen (450, 350) is 400,300 past the svg's own screen origin, i.e. local (1000, 750).
    const local = screenToLocal(ctm, 450, 350);
    expect(local.x).toBeCloseTo(1000, 9);
    expect(local.y).toBeCloseTo(750, 9);
  });

  it('round-trips: screenToLocal(localToScreen(p)) === p, for an arbitrary transform', () => {
    const ctm: MatrixLike = { a: 1.7, b: 0.3, c: -0.2, d: 1.4, e: 15, f: -30 };
    const local = { x: 42, y: -17 };
    const screen = localToScreen(ctm, local.x, local.y);
    const back = screenToLocal(ctm, screen.x, screen.y);
    expect(back.x).toBeCloseTo(local.x, 10);
    expect(back.y).toBeCloseTo(local.y, 10);
  });
});

describe('dragNewPosition', () => {
  it('is a no-op when the pointer has not moved', () => {
    const origin = { x: 300, y: 400 };
    const start = { x: 10, y: 10 };
    expect(dragNewPosition(origin, start, start)).toEqual(origin);
  });

  it('moves the origin by exactly the local-space pointer delta', () => {
    const origin = { x: 300, y: 400 };
    const start = { x: 10, y: 10 };
    const current = { x: 25, y: 4 };
    expect(dragNewPosition(origin, start, current)).toEqual({ x: 315, y: 394 });
  });

  it('is independent of where in the room the drag itself started, only the delta matters', () => {
    const origin = { x: 0, y: 0 };
    const deltaOnly = dragNewPosition(origin, { x: 500, y: 500 }, { x: 520, y: 480 });
    expect(deltaOnly).toEqual({ x: 20, y: -20 });
  });
});
