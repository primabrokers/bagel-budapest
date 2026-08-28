import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import twConfig from '../../tailwind.config';

/*
  The colour tokens have to stay readable, and the two files that declare them have to agree.

  Ported from the CRM's own src/styles/tokenContrast.test.ts, whose audit found the same class
  of defect everywhere it looked: a value that was never run through a contrast calculator, only
  eyeballed. `--text-faint` shipped there at 2.54:1; `--separator-strong` — the off state of
  every toggle — at 1.50:1; the gold ink ramp was non-monotonic, with 800 lighter than 700. None
  of that is visible to eslint, which cannot evaluate a hex against a background it has no way to
  know about. So the floor lives here, in a test that computes real WCAG contrast ratios and
  fails the moment a value stops clearing them — not a comment promising it was checked once.

  Five things are checked.

  1. THE TWO FILES AGREE. tokens.css feeds anything written in plain CSS; tailwind.config.ts
     feeds every `text-*` / `bg-*` / `border-*` class. A value changed in one and not the other
     is invisible until someone notices two shades of the same colour on one screen.

  2. INK CLEARS THE BODY-TEXT FLOOR (4.5:1) against every surface it actually sits on — not just
     white. `canvas` is the darkest of the three, so it sets the worst case; a token that passes
     there passes on `surface` and `hover` too. `text-faint` and `text-disabled` are DELIBERATELY
     excluded from this floor and checked against a lower one instead — see point 4.

  3. THE GOLD INK RAMP (600–950) DESCENDS. Those rungs exist specifically to be read as text —
     unlike 50–500, which are fills — and each has to be darker than the one before it, or a
     component reaching for a "darker gold" gets a paler one instead.

  4. FAINT AND DISABLED TEXT STAY ABOVE THE NON-TEXT FLOOR (3:1), EVEN THOUGH THEY ARE EXEMPT
     FROM THE BODY-TEXT ONE. WCAG 1.4.3 does not require disabled or merely-decorative text to
     hit 4.5:1, and looking dimmer than ordinary text is the entire point of both rungs — but
     "exempt from 4.5:1" is not "exempt from being legible at all". Both are still real content
     (a disabled field's placeholder, a faint timestamp) that someone is meant to read, just not
     required to read as easily as body copy, so 3:1 — the floor WCAG sets for large text and for
     the controls in point 5 — is where the line is drawn instead.

  5. CONTROL BOUNDARIES CLEAR THE NON-TEXT FLOOR (3:1). `--separator-strong` / `--border-control`
     is the outline of every Input/Select/Textarea and the off state of every Toggle — WCAG
     1.4.11's floor for anything that identifies a control, not a decorative divider.
*/

// --- colour maths (WCAG 2.1 relative luminance) ---------------------------------

function channel(c: number): number {
  const s = c / 255;
  return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}

function luminance(hex: string): number {
  const h = hex.replace('#', '');
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** WCAG contrast ratio, 1:1 to 21:1. Symmetric — which colour is the text does not matter. */
export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

// --- the declared values --------------------------------------------------------

const CSS = readFileSync(join('src', 'styles', 'tokens.css'), 'utf8');

function cssToken(name: string): string {
  const m = CSS.match(new RegExp(`--${name}\\s*:\\s*(#[0-9A-Fa-f]{6})\\s*;`));
  if (!m) throw new Error(`--${name} is not declared as a hex literal in tokens.css`);
  return m[1].toUpperCase();
}

const colors = (twConfig.theme?.extend?.colors ?? {}) as Record<string, unknown>;

function twColor(path: string): string {
  const value = path.split('.').reduce<unknown>((acc, key) => {
    if (acc && typeof acc === 'object') return (acc as Record<string, unknown>)[key];
    return undefined;
  }, colors);
  if (typeof value !== 'string') throw new Error(`tailwind.config.ts has no colour at ${path}`);
  return value.toUpperCase();
}

/** Every surface the app paints text onto. Canvas is the darkest, so it sets the worst case. */
const SURFACES = {
  surface: '#FFFFFF',
  canvas: cssToken('canvas'),
  hover: cssToken('hover'),
  'plum-50': cssToken('plum-50'),
  'gold-50': cssToken('gold-50'),
};

const BODY_TEXT = 4.5; // WCAG 1.4.3 for text below 18px / 14px bold — which is nearly all of it
const NON_TEXT = 3.0; // WCAG 1.4.11 for boundaries that identify a control, and the floor faint/disabled text is held to instead

describe('colour tokens', () => {
  it('declares the same value in tokens.css and tailwind.config.ts', () => {
    const pairs: Array<[string, string]> = [
      ['text-primary', 'text.primary'],
      ['text-secondary', 'text.secondary'],
      ['text-muted', 'text.muted'],
      ['text-faint', 'text.faint'],
      ['text-disabled', 'text.disabled'],
      ['text-inverse', 'text.inverse'],
      ['separator', 'separator.DEFAULT'],
      ['separator-strong', 'separator.strong'],
      ['separator-soft', 'separator.soft'],
      ['border-control', 'separator.control'],
      ['canvas', 'canvas'],
      ['hover', 'hover'],
      ['surface', 'surface'],
      ['warning-text', 'warning.text'],
      ['success-text', 'success.text'],
      ['danger-text', 'danger.text'],
      ['info-text', 'info.text'],
      ['warning-bg', 'warning.bg'],
      ['success-bg', 'success.bg'],
      ['danger-bg', 'danger.bg'],
      ['info-bg', 'info.bg'],
      ...([50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950].flatMap((s) => [
        [`plum-${s}`, `plum.${s}`],
        [`gold-${s}`, `gold.${s}`],
      ]) as Array<[string, string]>),
    ];
    const drift = pairs
      .filter(([css, tw]) => cssToken(css) !== twColor(tw))
      .map(([css, tw]) => `--${css} is ${cssToken(css)} but ${tw} is ${twColor(tw)}`);
    expect(drift, `tokens.css and tailwind.config.ts disagree:\n${drift.join('\n')}`).toEqual([]);
  });

  it('keeps every body-text ink token above the 4.5:1 floor on every surface it sits on', () => {
    const ink = [
      'text-primary',
      'text-secondary',
      'text-muted',
      'warning-text',
      'success-text',
      'danger-text',
      'info-text',
      // The gold ink sub-ramp — see the derivation note in tokens.css. These are read far more
      // than they fill, unlike gold-50..500.
      'gold-600',
      'gold-700',
      'gold-800',
      'gold-900',
      'gold-950',
    ];
    const fails: string[] = [];
    for (const token of ink) {
      const value = cssToken(token);
      for (const [name, bg] of Object.entries(SURFACES)) {
        const ratio = contrastRatio(value, bg);
        if (ratio < BODY_TEXT) fails.push(`--${token} ${value} on ${name} ${bg} = ${ratio.toFixed(2)}:1`);
      }
    }
    expect(fails, `below ${BODY_TEXT}:1:\n${fails.join('\n')}`).toEqual([]);
  });

  it('the gold ink rung clears 4.5:1 on white specifically', () => {
    // Called out on its own because it is the rung most likely to be reached for directly
    // (gold-600 is the "readable gold" call site) and the champagne fill rungs below it (50–500)
    // do NOT clear this — gold-500 on white is 2.63:1, which is why the ink sub-ramp exists.
    const ratio = contrastRatio(cssToken('gold-600'), '#FFFFFF');
    expect(ratio).toBeGreaterThanOrEqual(BODY_TEXT);
  });

  it('keeps faint and disabled text above the non-text floor, though both are exempt from 4.5:1', () => {
    const fails: string[] = [];
    for (const token of ['text-faint', 'text-disabled']) {
      const value = cssToken(token);
      for (const [name, bg] of Object.entries(SURFACES)) {
        const ratio = contrastRatio(value, bg);
        if (ratio < NON_TEXT) fails.push(`--${token} ${value} on ${name} ${bg} = ${ratio.toFixed(2)}:1`);
      }
    }
    expect(fails, `below ${NON_TEXT}:1:\n${fails.join('\n')}`).toEqual([]);
  });

  it('keeps control boundaries above the non-text floor', () => {
    // A toggle's off state, an unchecked checkbox, and the outline of every Input, Select and
    // Textarea. Not the decorative dividers (`--separator`) — WCAG asks for 3:1 on what
    // identifies a control, not on every hairline in the app.
    const fails: string[] = [];
    for (const token of ['separator-strong', 'border-control']) {
      const value = cssToken(token);
      for (const [name, bg] of Object.entries(SURFACES)) {
        const ratio = contrastRatio(value, bg);
        if (ratio < NON_TEXT) fails.push(`--${token} ${value} on ${name} ${bg} = ${ratio.toFixed(2)}:1`);
      }
    }
    expect(fails, `below ${NON_TEXT}:1:\n${fails.join('\n')}`).toEqual([]);
  });

  it('keeps every semantic family\'s text readable on its own background', () => {
    const families = ['danger', 'warning', 'success', 'info'] as const;
    const fails: string[] = [];
    for (const family of families) {
      const text = cssToken(`${family}-text`);
      const bg = cssToken(`${family}-bg`);
      const ratio = contrastRatio(text, bg);
      if (ratio < BODY_TEXT) fails.push(`--${family}-text ${text} on --${family}-bg ${bg} = ${ratio.toFixed(2)}:1`);
    }
    expect(fails, `below ${BODY_TEXT}:1:\n${fails.join('\n')}`).toEqual([]);
  });

  it('descends monotonically through the gold ink ramp', () => {
    const rungs = [600, 700, 800, 900, 950].map((s) => ({ s, hex: cssToken(`gold-${s}`) }));
    const wrong = rungs
      .slice(1)
      .filter((rung, i) => luminance(rung.hex) >= luminance(rungs[i].hex))
      .map((rung, i) => `gold-${rung.s} ${rung.hex} is not darker than gold-${rungs[i].s} ${rungs[i].hex}`);
    expect(wrong, `the ink ramp must get darker:\n${wrong.join('\n')}`).toEqual([]);
  });

  it('a deliberately bad value would fail this suite (the suite is not vacuous)', () => {
    // Guards against the floor being checked with assertions that would pass no matter what is
    // in tokens.css. The old gold-500 (#EFAE2C-family champagne, ~2.6:1 on white) is exactly the
    // shape of value this file exists to catch if it were ever promoted to an ink rung by
    // mistake — so it must fail the same check real ink rungs pass.
    const badGold500Style = '#C29A3C';
    expect(contrastRatio(badGold500Style, '#FFFFFF')).toBeLessThan(BODY_TEXT);
  });
});

// --- shades that do not exist ---------------------------------------------------

const ROOTS = ['src'];
const EXTS = ['.ts', '.tsx'];
const SKIP_DIRS = new Set(['node_modules', 'dist', '.git']);

function walk(dir: string, out: string[] = []): string[] {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const name of entries) {
    if (SKIP_DIRS.has(name)) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (EXTS.some((e) => name.endsWith(e))) out.push(full);
  }
  return out;
}

describe('palette shades in use', () => {
  const files = ROOTS.flatMap((r) => walk(r));

  it('finds files to check — a silently empty sweep would pass vacuously', () => {
    expect(files.length).toBeGreaterThan(5);
  });

  it('only asks for shades the palette actually defines', () => {
    // Tailwind emits nothing at all for an undefined shade: `text-gold-450` produces no rule and
    // the element silently inherits whatever colour it was sitting in already — not a compile
    // error, not a lint error, not something you would notice by looking. Scoped to the two
    // palettes this repo owns; Tailwind's own families (slate, red…) always resolve.
    const PATTERN = /\b(?:text|bg|border|ring|from|to|via|decoration|divide|outline|shadow|fill|stroke|accent|caret|placeholder)-(plum|gold)-(\d{2,3})\b/g;
    const hits: string[] = [];
    for (const file of files) {
      if (file.endsWith('tokenContrast.test.ts')) continue;
      const lines = readFileSync(file, 'utf8').split('\n');
      lines.forEach((line, i) => {
        for (const m of line.matchAll(PATTERN)) {
          const [, family, shade] = m;
          const defined = (colors[family] as Record<string, string> | undefined)?.[shade];
          if (!defined) hits.push(`${file}:${i + 1}: ${family}-${shade} is not defined — this class emits nothing`);
        }
      });
    }
    expect(hits, `undefined palette shades:\n${hits.join('\n')}`).toEqual([]);
  });
});
