import { describe, expect, it } from 'vitest';
import { extractHtmlFragment, extractJsonObject } from './aiDesign';

/**
 * Only the two pure extractors are tested here. `generateInvitationDesign` itself is a thin shell
 * around `supabase.functions.invoke` plus `parseInvitationDesignSpec` / `sanitiseInvitationHtml`,
 * both of which are covered thoroughly in `lib/invitations/*.test.ts`; mocking the Supabase client
 * to re-assert their behaviour through a second layer would test the mock, not the app.
 */

describe('extractJsonObject', () => {
  it('parses bare JSON', () => {
    expect(extractJsonObject('{"layout":"centred"}')).toEqual({ layout: 'centred' });
  });

  it('unwraps a ```json fence, which models add even when told not to', () => {
    expect(extractJsonObject('```json\n{"a":1}\n```')).toEqual({ a: 1 });
  });

  it('unwraps an unlabelled fence', () => {
    expect(extractJsonObject('```\n{"a":1}\n```')).toEqual({ a: 1 });
  });

  it('ignores a sentence of preamble before the object', () => {
    expect(extractJsonObject('Here is your design:\n{"a":1}')).toEqual({ a: 1 });
  });

  it('ignores trailing commentary after the object', () => {
    expect(extractJsonObject('{"a":1}\n\nLet me know if you would like it warmer.')).toEqual({ a: 1 });
  });

  it('keeps nested braces intact by taking the outermost pair', () => {
    expect(extractJsonObject('{"palette":{"bg":"#ffffff"}}')).toEqual({ palette: { bg: '#ffffff' } });
  });

  it('returns null for malformed JSON rather than throwing', () => {
    expect(extractJsonObject('{"a":')).toBeNull();
    expect(extractJsonObject('{not json at all}')).toBeNull();
  });

  it('returns null when there is no object at all', () => {
    expect(extractJsonObject('I cannot help with that.')).toBeNull();
    expect(extractJsonObject('')).toBeNull();
  });
});

describe('extractHtmlFragment', () => {
  it('returns bare markup unchanged', () => {
    expect(extractHtmlFragment('<p>hi</p>')).toBe('<p>hi</p>');
  });

  it('unwraps an ```html fence', () => {
    expect(extractHtmlFragment('```html\n<p>hi</p>\n```')).toBe('<p>hi</p>');
  });

  it('unwraps an unlabelled fence', () => {
    expect(extractHtmlFragment('```\n<p>hi</p>\n```')).toBe('<p>hi</p>');
  });

  it('trims surrounding whitespace', () => {
    expect(extractHtmlFragment('\n\n  <p>hi</p>  \n')).toBe('<p>hi</p>');
  });
});
