/**
 * Screen↔local coordinate maths for the seating planner's SVG canvas, factored out of
 * `FloorCanvas` so it is unit-testable without a real browser SVG element (this project's Vitest
 * runs with `environment: 'node'` — see CLAUDE.md).
 *
 * `getScreenCTM()`, called on whichever SVG element the caller is dragging against, already folds
 * in the current viewBox AND any pan/zoom transform between that element and the screen — so
 * `FloorCanvas` calls it fresh on every `pointerdown`/`pointermove` rather than this module ever
 * needing to know how pan/zoom are implemented. It only ever has to invert or apply ONE affine
 * matrix.
 *
 * `MatrixLike` deliberately mirrors the six numeric fields every `DOMMatrix`/`SVGMatrix` exposes
 * (`a b c d e f` — the standard 2D affine transform layout: `x' = a*x + c*y + e`,
 * `y' = b*x + d*y + f`), so a real `getScreenCTM()` result can be passed straight in, and a test
 * can pass a plain object instead.
 */

export interface MatrixLike {
  a: number;
  b: number;
  c: number;
  d: number;
  e: number;
  f: number;
}

export interface Point {
  x: number;
  y: number;
}

/** The identity transform — a 1:1, untranslated mapping. Exported for tests, and for a caller
 *  that wants a sane default before a real element has ever laid out. */
export function identityMatrix(): MatrixLike {
  return { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
}

/**
 * The inverse of an affine 2D transform. Throws if the matrix is singular (zero determinant) — a
 * degenerate CTM (e.g. an element with `display: none`, or a zero-scale transform) means there is
 * no meaningful screen position to convert, and a caller should not silently draw at (0, 0) as if
 * there were one.
 */
export function invertMatrix(m: MatrixLike): MatrixLike {
  const det = m.a * m.d - m.b * m.c;
  if (det === 0) throw new Error('pointerDrag: cannot invert a singular transform matrix.');
  return {
    a: m.d / det,
    b: -m.b / det,
    c: -m.c / det,
    d: m.a / det,
    e: (m.c * m.f - m.d * m.e) / det,
    f: (m.b * m.e - m.a * m.f) / det,
  };
}

/** Applies an affine transform to a point: `[x', y'] = [a c e; b d f] · [x, y, 1]`. */
export function applyMatrix(m: MatrixLike, point: Point): Point {
  return {
    x: m.a * point.x + m.c * point.y + m.e,
    y: m.b * point.x + m.d * point.y + m.f,
  };
}

/**
 * A pointer event's screen coordinates (`clientX`/`clientY`) converted into the local coordinate
 * system of whichever SVG element `ctm` came from — e.g. a floor object's `x`/`y` room-cm frame,
 * once `ctm` is that object's own pan/zoom-aware ancestor's `getScreenCTM()`.
 */
export function screenToLocal(ctm: MatrixLike, screenX: number, screenY: number): Point {
  return applyMatrix(invertMatrix(ctm), { x: screenX, y: screenY });
}

/** The reverse of `screenToLocal` — a local point's position on screen. Used for placing a
 *  desktop drag-ghost under the pointer in the same coordinate system a drag started in. */
export function localToScreen(ctm: MatrixLike, x: number, y: number): Point {
  return applyMatrix(ctm, { x, y });
}

/**
 * Given where an object's own `x`/`y` was when a drag began (`origin`), and the drag's start and
 * current pointer position (both already converted to the SAME local coordinate frame `origin` is
 * in, via `screenToLocal`), the object's new `x`/`y`. A plain vector add, but named and tested so
 * `FloorCanvas`'s `onPointerMove` reads as "move the object by however far the pointer has
 * moved" rather than repeating the subtraction inline at every call site.
 */
export function dragNewPosition(origin: Point, dragStartLocal: Point, dragCurrentLocal: Point): Point {
  return {
    x: origin.x + (dragCurrentLocal.x - dragStartLocal.x),
    y: origin.y + (dragCurrentLocal.y - dragStartLocal.y),
  };
}
