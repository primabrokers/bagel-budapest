import { describe, expect, it } from 'vitest';
import {
  invitationSpecJsonSchema,
  isSafeAssetPath,
  parseInvitationDesignSpec,
  toPlainSpecText,
} from './designSpec';

/**
 * These tests are the contract for "a model returned something odd and a guest must not see the
 * consequences". Most of them feed `parseInvitationDesignSpec` input no honest model would
 * produce, because the parser also runs on whatever is sitting in the `design` jsonb column,
 * which nothing in the schema constrains.
 */

const validSpec = {
  layout: 'centred',
  palette: { bg: '#FAF7F2', ink: '#2B2118', accent: '#8A6A3B' },
  fontFamily: 'fraunces',
  ornament: 'star-of-david',
  motion: 'fade-reveal',
  lines: [
    { role: 'eyebrow', text: 'With joy and gratitude' },
    { role: 'names', text: 'Ari Geller', emphasis: true },
  ],
};

describe('toPlainSpecText', () => {
  it('strips tags rather than escaping them, so markup never reaches the page as tag soup', () => {
    expect(toPlainSpecText('<b>Ari</b> Geller')).toBe('Ari Geller');
  });

  it('removes a script element entirely, contents included', () => {
    expect(toPlainSpecText('Ari<script>alert(1)</script>')).toBe('Arialert(1)');
  });

  it('collapses the whitespace of a model-wrapped, indented line', () => {
    expect(toPlainSpecText('Shabbos\n\n   Parshas    Toldos')).toBe('Shabbos Parshas Toldos');
  });

  it('returns an empty string for a non-string, so a null line is dropped not rendered', () => {
    expect(toPlainSpecText(null)).toBe('');
    expect(toPlainSpecText(42)).toBe('');
  });

  it('caps an absurdly long line', () => {
    expect(toPlainSpecText('a'.repeat(1000)).length).toBe(240);
  });
});

describe('isSafeAssetPath', () => {
  it('accepts a plain path inside the bucket', () => {
    expect(isSafeAssetPath('event-id/backgrounds/gold.png')).toBe(true);
  });

  it.each([
    ['an absolute path', '/etc/passwd.png'],
    ['a traversal', 'event/../../secret.png'],
    ['a protocol-relative host', '//evil.example/x.png'],
    ['an http URL', 'https://evil.example/x.png'],
    ['a javascript scheme', 'javascript:alert(1)//x.png'],
    ['a data URL', 'data:image/png;base64,AAAA'],
    ['a non-image extension', 'event/design.svg'],
    ['an executable extension', 'event/payload.html'],
  ])('rejects %s', (_label, path) => {
    expect(isSafeAssetPath(path)).toBe(false);
  });
});

describe('parseInvitationDesignSpec', () => {
  it('accepts a well-formed spec and lowercases its colours', () => {
    const { spec, errors } = parseInvitationDesignSpec(validSpec);
    expect(errors).toEqual([]);
    expect(spec).not.toBeNull();
    expect(spec?.palette.bg).toBe('#faf7f2');
    expect(spec?.lines).toHaveLength(2);
    expect(spec?.lines[1]).toEqual({ role: 'names', text: 'Ari Geller', emphasis: true });
  });

  it('returns null rather than throwing when handed something that is not an object', () => {
    expect(parseInvitationDesignSpec('nope').spec).toBeNull();
    expect(parseInvitationDesignSpec(null).spec).toBeNull();
    expect(parseInvitationDesignSpec([]).spec).toBeNull();
  });

  it('returns null when there are no usable lines', () => {
    expect(parseInvitationDesignSpec({ ...validSpec, lines: [] }).spec).toBeNull();
  });

  it('returns null when every line is empty once tags are stripped', () => {
    const result = parseInvitationDesignSpec({ ...validSpec, lines: [{ role: 'body', text: '<i></i>' }] });
    expect(result.spec).toBeNull();
    expect(result.errors.join(' ')).toMatch(/empty/i);
  });

  it('falls back to a known value for an unrecognised enum instead of passing it through', () => {
    const { spec } = parseInvitationDesignSpec({ ...validSpec, layout: 'drop-shadow-3d', motion: 'explode' });
    expect(spec?.layout).toBe('centred');
    expect(spec?.motion).toBe('none');
  });

  it('replaces a colour that is not #rrggbb, so no raw value reaches a style attribute', () => {
    const { spec, errors } = parseInvitationDesignSpec({
      ...validSpec,
      palette: { bg: 'red; background-image: url(javascript:alert(1))', ink: '#000000', accent: '#111111' },
    });
    expect(spec?.palette.bg).toBe('#faf7f2');
    expect(errors.join(' ')).toMatch(/background colour/i);
  });

  it('rejects a three-digit hex, which would otherwise widen what the regex admits', () => {
    const { spec } = parseInvitationDesignSpec({ ...validSpec, palette: { bg: '#fff', ink: '#000000', accent: '#111111' } });
    expect(spec?.palette.bg).toBe('#faf7f2');
  });

  it('drops an unsafe background path but still returns a renderable spec', () => {
    const { spec, errors } = parseInvitationDesignSpec({
      ...validSpec,
      backgroundAssetPath: 'https://evil.example/tracker.png',
    });
    expect(spec).not.toBeNull();
    expect(spec?.backgroundAssetPath).toBeUndefined();
    expect(errors.join(' ')).toMatch(/background image path/i);
  });

  it('keeps a safe background path', () => {
    const { spec } = parseInvitationDesignSpec({ ...validSpec, backgroundAssetPath: 'ev/bg.webp' });
    expect(spec?.backgroundAssetPath).toBe('ev/bg.webp');
  });

  it('truncates an over-long line list and says so', () => {
    const lines = Array.from({ length: 30 }, (_, i) => ({ role: 'body', text: `line ${i}` }));
    const { spec, errors } = parseInvitationDesignSpec({ ...validSpec, lines });
    expect(spec?.lines).toHaveLength(14);
    expect(errors.join(' ')).toMatch(/first 14/i);
  });

  it('skips a malformed line entry without discarding the good ones around it', () => {
    const { spec } = parseInvitationDesignSpec({
      ...validSpec,
      lines: [{ role: 'body', text: 'kept' }, 'not an object', null, { role: 'body', text: 'also kept' }],
    });
    expect(spec?.lines.map((l) => l.text)).toEqual(['kept', 'also kept']);
  });

  it('treats a non-boolean emphasis as absent rather than truthy', () => {
    const { spec } = parseInvitationDesignSpec({
      ...validSpec,
      lines: [{ role: 'body', text: 'x', emphasis: 'yes' }],
    });
    expect(spec?.lines[0].emphasis).toBe(false);
  });
});

describe('invitationSpecJsonSchema', () => {
  it('advertises the same enums the parser accepts, so schema and validation cannot drift', () => {
    const schema = invitationSpecJsonSchema();
    const props = schema.properties as Record<string, { enum?: string[] }>;
    // A layout the schema offers must survive the parser unchanged.
    for (const layout of props.layout.enum ?? []) {
      expect(parseInvitationDesignSpec({ ...validSpec, layout }).spec?.layout).toBe(layout);
    }
  });

  it('closes the object so a model cannot smuggle extra fields past the schema', () => {
    expect(invitationSpecJsonSchema().additionalProperties).toBe(false);
  });
});
