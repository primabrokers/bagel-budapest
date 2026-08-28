import { describe, expect, it } from 'vitest';
import { INVITATION_IFRAME_SANDBOX, sanitiseInvitationHtml } from './sanitiseInvitationHtml';

/**
 * These assert what the tidying pass removes. They deliberately do NOT claim the output is
 * XSS-safe markup — the sandboxed, scriptless iframe is what makes it safe to render, and the
 * first test below pins that attribute so nobody loosens it without a failing test to explain.
 */

describe('INVITATION_IFRAME_SANDBOX', () => {
  it('grants nothing — in particular never allow-scripts, which is the real security boundary', () => {
    expect(INVITATION_IFRAME_SANDBOX).toBe('');
    expect(INVITATION_IFRAME_SANDBOX).not.toContain('allow-scripts');
    expect(INVITATION_IFRAME_SANDBOX).not.toContain('allow-same-origin');
  });
});

describe('sanitiseInvitationHtml', () => {
  it('keeps ordinary invitation markup and its styling intact', () => {
    const html = '<div class="card"><style>.card{color:#333}</style><h1>Ari Geller</h1><p>Toldos</p></div>';
    const result = sanitiseInvitationHtml(html);
    expect(result.html).toContain('<h1>Ari Geller</h1>');
    expect(result.html).toContain('<style>');
    expect(result.removed).toEqual([]);
  });

  it('removes a script element together with its contents', () => {
    const result = sanitiseInvitationHtml('<p>hi</p><script>alert(1)</script>');
    expect(result.html).not.toMatch(/alert\(1\)/);
    expect(result.html).toContain('<p>hi</p>');
    expect(result.removed.join(' ')).toMatch(/script/);
  });

  it('removes a self-closing or unclosed script tag', () => {
    expect(sanitiseInvitationHtml('<script src="https://evil.example/x.js">').html).not.toContain('script');
  });

  it('strips comments first, so markup hidden inside one cannot be recovered by a parser', () => {
    const result = sanitiseInvitationHtml('<p>a</p><!-- <script>alert(1)</script> -->');
    expect(result.html).not.toMatch(/alert\(1\)/);
    expect(result.html).not.toContain('<!--');
  });

  it.each([
    ['double quoted', '<div onclick="alert(1)">x</div>'],
    ['single quoted', "<div onclick='alert(1)'>x</div>"],
    ['unquoted', '<div onclick=alert(1)>x</div>'],
    ['uppercase', '<div ONERROR="alert(1)">x</div>'],
    ['spaced', '<div onclick = "alert(1)">x</div>'],
  ])('removes a %s inline event handler', (_label, html) => {
    const result = sanitiseInvitationHtml(html);
    expect(result.html.toLowerCase()).not.toMatch(/on(click|error)\s*=/);
  });

  it('neutralises javascript: and vbscript: URLs', () => {
    const result = sanitiseInvitationHtml('<a href="javascript:alert(1)">x</a><a href="VBScript:x">y</a>');
    expect(result.html.toLowerCase()).not.toContain('javascript:');
    expect(result.html.toLowerCase()).not.toContain('vbscript:');
  });

  it('neutralises a data:text/html URL but keeps an inlined image', () => {
    const result = sanitiseInvitationHtml(
      '<a href="data:text/html,<script>alert(1)</script>">x</a><img src="data:image/png;base64,AAAA">',
    );
    expect(result.html.toLowerCase()).not.toContain('data:text/html');
    expect(result.html).toContain('data:image/png;base64,AAAA');
  });

  it('removes framing and plugin elements', () => {
    const result = sanitiseInvitationHtml('<iframe src="x"></iframe><object data="y"></object><embed src="z">');
    expect(result.html).toBe('');
  });

  it('removes a form wrapper but keeps the text inside it', () => {
    const result = sanitiseInvitationHtml('<form action="https://evil.example"><p>RSVP</p></form>');
    expect(result.html).toContain('<p>RSVP</p>');
    expect(result.html).not.toContain('<form');
  });

  it('removes document-level tags that have no business in a fragment', () => {
    const result = sanitiseInvitationHtml('<base href="https://evil.example"><meta http-equiv="refresh" content="0"><p>a</p>');
    expect(result.html).toBe('<p>a</p>');
  });

  it('truncates markup beyond the cap and says so', () => {
    const result = sanitiseInvitationHtml(`<p>${'a'.repeat(70_000)}</p>`);
    expect(result.html.length).toBeLessThanOrEqual(60_000);
    expect(result.removed.join(' ')).toMatch(/truncated/i);
  });

  it('returns empty for non-string or blank input rather than throwing', () => {
    expect(sanitiseInvitationHtml(null).html).toBe('');
    expect(sanitiseInvitationHtml('   ').html).toBe('');
    expect(sanitiseInvitationHtml(undefined).removed.length).toBeGreaterThan(0);
  });
});
