import { describe, expect, it } from 'vitest';
import { buildFamilyInviteMessage, normaliseInviteEmail } from './inviteMessage';

describe('normaliseInviteEmail', () => {
  it('lowercases, which is the difference between an invite that works and one that never can', () => {
    // Supabase stores account emails lowercased and bm_ensure_event_provisioned() compares the
    // invite to auth.email(). An invite stored with a capital is unclaimable by anybody.
    expect(normaliseInviteEmail('Sara@Gmail.com')).toBe('sara@gmail.com');
    expect(normaliseInviteEmail('  BOOKING@Shul.ORG  ')).toBe('booking@shul.org');
  });

  it('accepts an ordinary address unchanged', () => {
    expect(normaliseInviteEmail('sara@bloom.example')).toBe('sara@bloom.example');
  });

  it.each([
    ['empty', ''],
    ['whitespace only', '   '],
    ['no at', 'sara.example.com'],
    ['no domain dot', 'sara@example'],
    ['a space inside', 'sa ra@example.com'],
    ['two addresses', 'a@b.com c@d.com'],
  ])('rejects %s', (_label, value) => {
    expect(normaliseInviteEmail(value)).toBeNull();
  });

  it('rejects an absurdly long value rather than storing it', () => {
    expect(normaliseInviteEmail(`${'a'.repeat(250)}@example.com`)).toBeNull();
  });
});

describe('buildFamilyInviteMessage', () => {
  const base = { appUrl: 'https://planner.example', inviteEmail: 'sara@bloom.example', boyName: 'Ari' };

  it('names the simcha in the subject, so it survives a crowded inbox', () => {
    expect(buildFamilyInviteMessage(base).subject).toContain('Ari');
  });

  it('spells out the one instruction that is not guessable: sign up with THIS address', () => {
    const { text, html } = buildFamilyInviteMessage(base);
    expect(text).toContain('sara@bloom.example');
    expect(text).toMatch(/exact email address/i);
    expect(text).toMatch(/has to match/i);
    expect(html).toContain('sara@bloom.example');
  });

  it('includes the app URL in both parts', () => {
    const { text, html } = buildFamilyInviteMessage(base);
    expect(text).toContain('https://planner.example');
    expect(html).toContain('href="https://planner.example"');
  });

  it('drops a trailing slash rather than producing a double slash', () => {
    const { text } = buildFamilyInviteMessage({ ...base, appUrl: 'https://planner.example/' });
    expect(text).toContain('https://planner.example');
    expect(text).not.toContain('example//');
  });

  it('credits the sender when there is one, and reads properly when there is not', () => {
    expect(buildFamilyInviteMessage({ ...base, invitedBy: 'Anthony' }).text).toMatch(/^Anthony has given you access/);
    expect(buildFamilyInviteMessage(base).text).toMatch(/^You have been given access/);
    expect(buildFamilyInviteMessage({ ...base, invitedBy: '   ' }).text).toMatch(/^You have been given access/);
  });

  it('escapes a name with markup in it instead of putting it into the HTML body raw', () => {
    const { html } = buildFamilyInviteMessage({ ...base, boyName: '<script>x</script>', invitedBy: 'A & B' });
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('A &amp; B');
  });
});
