import { describe, expect, it } from 'vitest';
import {
  VENDOR_MESSAGE_TEMPLATES,
  buildVendorMessage,
  vendorMessageTemplate,
  vendorMessageToHtml,
  type VendorMessageVars,
} from './contactTemplates';

const VARS: VendorMessageVars = {
  vendorName: 'Bloom & Co',
  contactName: 'Sara',
  category: 'Florist / décor',
  boyName: 'Ari Geller',
  eventDate: 'Saturday 14 November 2026',
  venue: 'The Grove',
  familyName: 'The Geller family',
};

describe('buildVendorMessage', () => {
  it('substitutes every placeholder in the subject and body', () => {
    const { subject, body } = buildVendorMessage('enquiry', VARS);
    expect(subject).toContain('Saturday 14 November 2026');
    expect(body).toContain('Sara');
    expect(body).toContain('Ari Geller');
    expect(body).toContain('The Grove');
    expect(body).toContain('Florist / décor');
    expect(`${subject} ${body}`).not.toMatch(/\{[a-zA-Z]+\}/);
  });

  it('leaves an unknown placeholder visible rather than blanking it, so a gap is obvious', () => {
    const { body } = buildVendorMessage('enquiry', { ...VARS, venue: '{venue}' });
    expect(body).toContain('{venue}');
  });

  it('builds a different message per kind', () => {
    const enquiry = buildVendorMessage('enquiry', VARS).body;
    const chase = buildVendorMessage('chase', VARS).body;
    const decline = buildVendorMessage('decline', VARS).body;
    expect(new Set([enquiry, chase, decline]).size).toBe(3);
  });

  it('names the vendor when confirming a booking', () => {
    expect(buildVendorMessage('accept', VARS).body).toContain('Bloom & Co');
  });

  it('falls back to the first template for an unrecognised kind', () => {
    // Cast: the point is what happens when a stored value drifts outside the union.
    expect(vendorMessageTemplate('nonsense' as never).kind).toBe('enquiry');
  });

  it('offers a template for every kind it advertises', () => {
    for (const template of VENDOR_MESSAGE_TEMPLATES) {
      expect(vendorMessageTemplate(template.kind).kind).toBe(template.kind);
    }
  });

  it('writes British English, not American', () => {
    const all = VENDOR_MESSAGE_TEMPLATES.map((t) => `${t.subject} ${t.body}`).join(' ');
    expect(all).not.toMatch(/\b(color|favorite|organize|apologize|thru)\b/i);
  });
});

describe('vendorMessageToHtml', () => {
  it('wraps paragraphs and turns single newlines into breaks', () => {
    expect(vendorMessageToHtml('One\nTwo\n\nThree')).toBe('<p>One<br />Two</p>\n<p>Three</p>');
  });

  it('escapes markup so nothing can be injected into an email sent in the family name', () => {
    const html = vendorMessageToHtml('<script>alert(1)</script>');
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('escapes ampersands in a real vendor name', () => {
    expect(vendorMessageToHtml('Bloom & Co')).toContain('Bloom &amp; Co');
  });

  it('escapes quotes, which would otherwise break an attribute if ever interpolated', () => {
    expect(vendorMessageToHtml('He said "hello"')).toContain('&quot;hello&quot;');
  });

  it('handles an empty body without producing stray markup', () => {
    expect(vendorMessageToHtml('')).toBe('<p></p>');
  });
});
