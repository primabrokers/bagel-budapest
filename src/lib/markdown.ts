/**
 * A markdown SUBSET parser for `bm_notes.body` — see docs/barmitzvah-planner-plan.md §3.4. This
 * is deliberately not a CommonMark implementation and pulls in no dependency: headings (`#`/`##`/
 * `###`), bold (`**text**`), italic (`*text*`), links (`[label](url)`), bullet lists (`- item`)
 * and GitHub-style checklists (`- [ ] item` / `- [x] item`) are the whole of it.
 *
 * Parses into a plain TOKEN TREE, not an HTML string. `NoteBody.tsx` renders that tree as real
 * React elements — nowhere in this app does a note reach `dangerouslySetInnerHTML` — which is
 * also what makes the link-scheme allowlist below actually enforceable: a `javascript:` (or any
 * other non-http(s)) URL never becomes an `href` in the first place, because the renderer only
 * ever sees a `link` node once this module has already decided the scheme is safe.
 */

export interface TextNode {
  type: 'text';
  value: string;
}

export interface BoldNode {
  type: 'bold';
  children: InlineNode[];
}

export interface ItalicNode {
  type: 'italic';
  children: InlineNode[];
}

export interface LinkNode {
  type: 'link';
  href: string;
  children: InlineNode[];
}

export type InlineNode = TextNode | BoldNode | ItalicNode | LinkNode;

export interface HeadingBlock {
  type: 'heading';
  level: 1 | 2 | 3;
  children: InlineNode[];
}

export interface ParagraphBlock {
  type: 'paragraph';
  children: InlineNode[];
}

export interface ListItemNode {
  /**
   * `null` — a plain bullet, not a checklist item. `true`/`false` — a GitHub-style `- [x]`/`- [ ]`
   * line, ticked or not.
   */
  checked: boolean | null;
  children: InlineNode[];
  /** 0-based index of this item's line in the SOURCE the block tree was parsed from. This is
   *  what lets a rendered checkbox call `toggleChecklistItem(source, line)` and rewrite exactly
   *  the line it represents, without re-parsing or guessing position from rendered content. */
  line: number;
}

export interface ListBlock {
  type: 'list';
  items: ListItemNode[];
}

export type BlockNode = HeadingBlock | ParagraphBlock | ListBlock;

const HEADING_RE = /^(#{1,3})\s+(.*)$/;
const LIST_ITEM_RE = /^-\s+(.*)$/;
const CHECKLIST_RE = /^\[( |x|X)\]\s?(.*)$/;

// Tried in order at each position: `**bold**` before `*italic*` so a bold run is never read as
// two adjacent italics — a leading `**` only ever matches the first alternative, and a lone `*`
// falls through to the second. Bold/italic content deliberately excludes `*` — a subset parser,
// not a full one — so nesting bold-in-italic or vice versa is out of scope, same as the rest of
// this module.
//
// A SOURCE STRING, not a compiled RegExp: `parseInline` recurses (bold/italic/link content is
// itself run back through `parseInline`), and a single shared `/g` RegExp object carries its
// `lastIndex` as mutable state on the object itself. A nested call resuming — or exhausting and
// auto-resetting — that SAME object's `lastIndex` would corrupt the outer call's position the
// moment control returned to it, sending the outer loop back to the start of its own text and
// re-emitting the same match forever. `parseInline` builds a fresh RegExp from this source on
// every call instead, so each stack frame owns its own scan position.
const INLINE_PATTERN = '\\*\\*([^*]+?)\\*\\*|\\*([^*]+?)\\*|\\[([^\\]]+)\\]\\(([^)]+)\\)';

/** Only `http://`/`https://` are ever rendered as a real link — anything else (a `javascript:`
 *  URI, a bare `mailto:`, plain garbage) renders as the label's plain text instead, never as an
 *  `href`. This is the one security-relevant line in the module; every other rule here is just
 *  formatting. */
function isSafeHref(href: string): boolean {
  return /^https?:\/\//i.test(href);
}

function parseInline(text: string): InlineNode[] {
  const nodes: InlineNode[] = [];
  let lastIndex = 0;
  const inlineRe = new RegExp(INLINE_PATTERN, 'g');
  let match: RegExpExecArray | null;
  while ((match = inlineRe.exec(text))) {
    if (match.index > lastIndex) {
      nodes.push({ type: 'text', value: text.slice(lastIndex, match.index) });
    }
    const [, bold, italic, linkLabel, linkHref] = match;
    if (bold !== undefined) {
      nodes.push({ type: 'bold', children: parseInline(bold) });
    } else if (italic !== undefined) {
      nodes.push({ type: 'italic', children: parseInline(italic) });
    } else if (linkLabel !== undefined && linkHref !== undefined) {
      if (isSafeHref(linkHref)) {
        nodes.push({ type: 'link', href: linkHref, children: parseInline(linkLabel) });
      } else {
        // Unsafe scheme: drop the URL entirely and keep only the label, as plain text — never
        // fall back to re-emitting the raw `[label](href)` source, which would still carry the
        // unsafe scheme as visible text a careless future change could turn back into a link.
        nodes.push({ type: 'text', value: linkLabel });
      }
    }
    // Computed from the match itself, not read back off `inlineRe.lastIndex` — belt and braces
    // against the exact reentrancy bug this function's header comment describes, even though
    // `inlineRe` being local to this call already fixes it.
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) {
    nodes.push({ type: 'text', value: text.slice(lastIndex) });
  }
  return nodes;
}

/**
 * Parses a note's raw markdown source into a block tree. Blank lines separate blocks; a run of
 * `- ` lines (checklist or plain bullet, freely mixed) becomes one `list` block; a run of `#`/
 * `##`/`###` lines are each their own `heading` block; everything else is folded into
 * `paragraph` blocks, one per blank-line-separated run, its lines joined with a space.
 */
export function parseMarkdown(source: string): BlockNode[] {
  const lines = source.split('\n');
  const blocks: BlockNode[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (line.trim() === '') {
      i += 1;
      continue;
    }

    const heading = HEADING_RE.exec(line);
    if (heading) {
      blocks.push({
        type: 'heading',
        level: heading[1].length as 1 | 2 | 3,
        children: parseInline(heading[2]),
      });
      i += 1;
      continue;
    }

    if (LIST_ITEM_RE.test(line)) {
      const items: ListItemNode[] = [];
      while (i < lines.length) {
        const itemMatch = LIST_ITEM_RE.exec(lines[i]);
        if (!itemMatch) break;
        const content = itemMatch[1];
        const checklistMatch = CHECKLIST_RE.exec(content);
        if (checklistMatch) {
          items.push({
            checked: checklistMatch[1].toLowerCase() === 'x',
            children: parseInline(checklistMatch[2]),
            line: i,
          });
        } else {
          items.push({ checked: null, children: parseInline(content), line: i });
        }
        i += 1;
      }
      blocks.push({ type: 'list', items });
      continue;
    }

    const paragraphLines: string[] = [];
    while (i < lines.length && lines[i].trim() !== '' && !HEADING_RE.test(lines[i]) && !LIST_ITEM_RE.test(lines[i])) {
      paragraphLines.push(lines[i]);
      i += 1;
    }
    blocks.push({ type: 'paragraph', children: parseInline(paragraphLines.join(' ')) });
  }

  return blocks;
}

/**
 * Flips one `- [ ]`/`- [x]` line in the raw markdown SOURCE and returns the new source, without a
 * parse/re-render round trip. This is what lets a rendered checkbox toggle a note's stored `body`
 * directly: `updateNote(id, { body: toggleChecklistItem(note.body, item.line) })`.
 *
 * `lineIndex` out of range, or a line that isn't a checklist item, returns `source` unchanged —
 * callers only ever pass a `line` that came from a `ListItemNode` with `checked !== null`, but
 * this stays a no-op rather than throwing if that ever drifts (a note edited elsewhere between
 * render and click, say).
 */
export function toggleChecklistItem(source: string, lineIndex: number): string {
  const lines = source.split('\n');
  if (lineIndex < 0 || lineIndex >= lines.length) return source;

  const match = /^(-\s+)\[( |x|X)\](.*)$/.exec(lines[lineIndex]);
  if (!match) return source;

  const nextMark = match[2].toLowerCase() === 'x' ? ' ' : 'x';
  lines[lineIndex] = `${match[1]}[${nextMark}]${match[3]}`;
  return lines.join('\n');
}
