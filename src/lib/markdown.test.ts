import { describe, expect, it } from 'vitest';
import { parseMarkdown, toggleChecklistItem, type BlockNode } from './markdown';

/** Flattens an inline tree back to plain text, for assertions that don't care about bold/italic
 *  boundaries. */
function plainText(nodes: { type: string; value?: string; children?: unknown[] }[]): string {
  return nodes
    .map((n) => {
      if (n.type === 'text') return n.value ?? '';
      return plainText((n.children ?? []) as never);
    })
    .join('');
}

describe('parseMarkdown', () => {
  it('parses a heading at each of the three supported levels', () => {
    const blocks = parseMarkdown('# One\n## Two\n### Three');
    expect(blocks).toEqual([
      { type: 'heading', level: 1, children: [{ type: 'text', value: 'One' }] },
      { type: 'heading', level: 2, children: [{ type: 'text', value: 'Two' }] },
      { type: 'heading', level: 3, children: [{ type: 'text', value: 'Three' }] },
    ]);
  });

  it('does not treat a bare # with no space as a heading', () => {
    const blocks = parseMarkdown('#hashtag');
    expect(blocks).toEqual([{ type: 'paragraph', children: [{ type: 'text', value: '#hashtag' }] }]);
  });

  it('parses bold and italic runs', () => {
    const blocks = parseMarkdown('This is **bold** and this is *italic*.');
    expect(blocks).toHaveLength(1);
    const [block] = blocks as [Extract<BlockNode, { type: 'paragraph' }>];
    expect(block.children).toEqual([
      { type: 'text', value: 'This is ' },
      { type: 'bold', children: [{ type: 'text', value: 'bold' }] },
      { type: 'text', value: ' and this is ' },
      { type: 'italic', children: [{ type: 'text', value: 'italic' }] },
      { type: 'text', value: '.' },
    ]);
  });

  it('does not swallow a bold run as two adjacent italics', () => {
    const blocks = parseMarkdown('**bold**');
    const [block] = blocks as [Extract<BlockNode, { type: 'paragraph' }>];
    expect(block.children).toEqual([{ type: 'bold', children: [{ type: 'text', value: 'bold' }] }]);
  });

  it('renders an http(s) link as a real link node', () => {
    const blocks = parseMarkdown('See [the venue](https://example.com/venue) for details.');
    const [block] = blocks as [Extract<BlockNode, { type: 'paragraph' }>];
    expect(block.children).toEqual([
      { type: 'text', value: 'See ' },
      { type: 'link', href: 'https://example.com/venue', children: [{ type: 'text', value: 'the venue' }] },
      { type: 'text', value: ' for details.' },
    ]);
  });

  it('accepts a plain http link', () => {
    const blocks = parseMarkdown('[insecure](http://example.com)');
    const [block] = blocks as [Extract<BlockNode, { type: 'paragraph' }>];
    expect(block.children).toEqual([
      { type: 'link', href: 'http://example.com', children: [{ type: 'text', value: 'insecure' }] },
    ]);
  });

  it('never emits a link node for a javascript: URL — renders the label as plain text instead', () => {
    const blocks = parseMarkdown('[click me](javascript:document.location=evil)');
    const [block] = blocks as [Extract<BlockNode, { type: 'paragraph' }>];
    expect(block.children).toEqual([{ type: 'text', value: 'click me' }]);
    // Belt and braces: nothing in the tree carries the unsafe scheme as an href, anywhere.
    expect(JSON.stringify(blocks)).not.toContain('javascript:');
  });

  it('rejects other unsafe-looking schemes the same way (data:, mailto:, a bare path)', () => {
    // Deliberately parenthesis-free hrefs: this is a markdown SUBSET parser (see the module
    // header), and `[label](url)` with an unescaped `)` inside `url` is unspecified even in full
    // CommonMark — real notes wrapping such a URL in angle brackets is out of scope here.
    for (const href of ['data:text/html,not-a-real-page', 'mailto:someone@example.com', '/relative/path']) {
      const blocks = parseMarkdown(`[label](${href})`);
      const [block] = blocks as [Extract<BlockNode, { type: 'paragraph' }>];
      expect(block.children).toEqual([{ type: 'text', value: 'label' }]);
    }
  });

  it('parses a plain bullet list', () => {
    const blocks = parseMarkdown('- First\n- Second\n- Third');
    expect(blocks).toEqual([
      {
        type: 'list',
        items: [
          { checked: null, children: [{ type: 'text', value: 'First' }], line: 0 },
          { checked: null, children: [{ type: 'text', value: 'Second' }], line: 1 },
          { checked: null, children: [{ type: 'text', value: 'Third' }], line: 2 },
        ],
      },
    ]);
  });

  it('parses a GitHub-style checklist, ticked and unticked, case-insensitively', () => {
    const blocks = parseMarkdown('- [ ] Book the venue\n- [x] Send save-the-dates\n- [X] Order the cake');
    const [block] = blocks as [Extract<BlockNode, { type: 'list' }>];
    expect(block.items.map((i) => i.checked)).toEqual([false, true, true]);
    expect(plainText(block.items[0].children)).toBe('Book the venue');
    expect(block.items.map((i) => i.line)).toEqual([0, 1, 2]);
  });

  it('allows plain bullets and checklist items in the same list', () => {
    const blocks = parseMarkdown('- Plain bullet\n- [ ] A task');
    const [block] = blocks as [Extract<BlockNode, { type: 'list' }>];
    expect(block.items[0].checked).toBeNull();
    expect(block.items[1].checked).toBe(false);
  });

  it('separates blocks on a blank line and joins a wrapped paragraph with a space', () => {
    const blocks = parseMarkdown('Line one\nLine two\n\nA new paragraph.');
    expect(blocks).toEqual([
      { type: 'paragraph', children: [{ type: 'text', value: 'Line one Line two' }] },
      { type: 'paragraph', children: [{ type: 'text', value: 'A new paragraph.' }] },
    ]);
  });

  it('returns an empty tree for an empty or whitespace-only source', () => {
    expect(parseMarkdown('')).toEqual([]);
    expect(parseMarkdown('   \n  \n')).toEqual([]);
  });

  it('parses a mix of headings, paragraphs and lists in one document', () => {
    const source = '# Décor ideas\n\nSome inspiration from the venue visit.\n\n- [ ] Confirm florist\n- [x] Pick a colour scheme';
    const blocks = parseMarkdown(source);
    expect(blocks.map((b) => b.type)).toEqual(['heading', 'paragraph', 'list']);
  });
});

describe('toggleChecklistItem', () => {
  it('flips an unticked item to ticked', () => {
    expect(toggleChecklistItem('- [ ] Book the venue', 0)).toBe('- [x] Book the venue');
  });

  it('flips a ticked item back to unticked', () => {
    expect(toggleChecklistItem('- [x] Book the venue', 0)).toBe('- [ ] Book the venue');
  });

  it('treats an uppercase X as ticked and flips it to unticked', () => {
    expect(toggleChecklistItem('- [X] Book the venue', 0)).toBe('- [ ] Book the venue');
  });

  it('only rewrites the targeted line, leaving the rest of the source untouched', () => {
    const source = '- [ ] First\n- [ ] Second\n- [x] Third';
    expect(toggleChecklistItem(source, 1)).toBe('- [ ] First\n- [x] Second\n- [x] Third');
  });

  it('preserves any trailing content after the checkbox exactly', () => {
    expect(toggleChecklistItem('- [ ] Call the **caterer** about [the menu](https://example.com)', 0)).toBe(
      '- [x] Call the **caterer** about [the menu](https://example.com)',
    );
  });

  it('is a no-op for a line index out of range', () => {
    const source = '- [ ] Only line';
    expect(toggleChecklistItem(source, 5)).toBe(source);
    expect(toggleChecklistItem(source, -1)).toBe(source);
  });

  it('is a no-op for a line that is not a checklist item', () => {
    const source = '- Plain bullet, not a checklist item';
    expect(toggleChecklistItem(source, 0)).toBe(source);
  });

  it('is a no-op for a heading or paragraph line', () => {
    expect(toggleChecklistItem('# A heading', 0)).toBe('# A heading');
    expect(toggleChecklistItem('Just a paragraph.', 0)).toBe('Just a paragraph.');
  });

  it('round-trips: parsing the toggled source flips exactly that item\'s checked state', () => {
    const source = '- [ ] A\n- [ ] B';
    const toggled = toggleChecklistItem(source, 1);
    const blocks = parseMarkdown(toggled);
    const [block] = blocks as [Extract<BlockNode, { type: 'list' }>];
    expect(block.items.map((i) => i.checked)).toEqual([false, true]);
  });
});
