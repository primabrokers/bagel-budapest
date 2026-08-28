import type { ReactNode } from 'react';
import { Check } from 'lucide-react';
import { parseMarkdown, type BlockNode, type InlineNode } from '../../lib/markdown';
import { cn } from '../../lib/cn';

interface NoteBodyProps {
  body: string;
  /**
   * Present — a checklist item's checkbox is a real, focusable control that calls this with the
   * `- [ ]`/`- [x]` line's index on click; the caller persists via
   * `updateNote(id, { body: toggleChecklistItem(body, line) }, { log: false })`. Omitted — the
   * checkbox still shows its checked state (an accurate read-only render), just disabled.
   */
  onToggleLine?: (lineIndex: number) => void;
  className?: string;
}

const HEADING_TAG = { 1: 'h3', 2: 'h4', 3: 'h5' } as const;
const HEADING_CLASS: Record<1 | 2 | 3, string> = {
  1: 'text-base font-semibold',
  2: 'text-sm font-semibold',
  3: 'text-sm font-medium',
};

function renderInline(nodes: InlineNode[], keyPrefix: string): ReactNode[] {
  return nodes.map((node, i) => {
    const key = `${keyPrefix}-${i}`;
    switch (node.type) {
      case 'text':
        return node.value;
      case 'bold':
        return (
          <strong key={key} className="font-semibold text-text-primary">
            {renderInline(node.children, key)}
          </strong>
        );
      case 'italic':
        return <em key={key}>{renderInline(node.children, key)}</em>;
      case 'link':
        return (
          <a
            key={key}
            href={node.href}
            target="_blank"
            rel="noopener noreferrer"
            className="text-plum-700 underline underline-offset-2 hover:text-plum-800"
          >
            {renderInline(node.children, key)}
          </a>
        );
      default:
        return null;
    }
  });
}

function renderBlock(block: BlockNode, index: number, onToggleLine?: (line: number) => void): ReactNode {
  const key = `block-${index}`;

  if (block.type === 'heading') {
    const Tag = HEADING_TAG[block.level];
    return (
      <Tag key={key} className={cn(HEADING_CLASS[block.level], 'text-text-primary')}>
        {renderInline(block.children, key)}
      </Tag>
    );
  }

  if (block.type === 'paragraph') {
    return (
      <p key={key} className="leading-relaxed">
        {renderInline(block.children, key)}
      </p>
    );
  }

  // block.type === 'list'
  return (
    <ul key={key} className="flex flex-col gap-1.5">
      {block.items.map((item, i) => {
        const itemKey = `${key}-item-${i}`;
        if (item.checked === null) {
          return (
            <li key={itemKey} className="flex gap-2">
              <span aria-hidden="true" className="mt-[9px] h-1 w-1 shrink-0 rounded-full bg-text-faint" />
              <span className="leading-relaxed">{renderInline(item.children, itemKey)}</span>
            </li>
          );
        }

        const interactive = !!onToggleLine;
        return (
          <li key={itemKey} className="flex items-start gap-2">
            <button
              type="button"
              role="checkbox"
              aria-checked={item.checked}
              aria-label={interactive ? 'Toggle checklist item' : undefined}
              disabled={!interactive}
              onClick={() => onToggleLine?.(item.line)}
              className={cn(
                'mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded border transition-colors',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-plum-400',
                item.checked ? 'border-plum-700 bg-plum-700 text-text-inverse' : 'border-separator-control bg-surface',
                !interactive && 'cursor-default',
              )}
            >
              {item.checked && <Check size={11} aria-hidden="true" strokeWidth={3} />}
            </button>
            <span className={cn('leading-relaxed', item.checked && 'text-text-muted line-through')}>
              {renderInline(item.children, itemKey)}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * Renders a note's raw markdown `body` as real React elements from `lib/markdown.ts`'s token
 * tree — never `dangerouslySetInnerHTML`. Used both as `NoteEditorSheet`'s live preview and as
 * every note's own display in `NotesPage`/`EntityNotes`, so a checklist tick in either place
 * behaves identically.
 */
export function NoteBody({ body, onToggleLine, className }: NoteBodyProps) {
  const blocks = parseMarkdown(body);

  if (blocks.length === 0) {
    return <p className={cn('text-sm italic text-text-faint', className)}>Nothing written yet.</p>;
  }

  return (
    <div className={cn('flex flex-col gap-2 text-sm text-text-primary', className)}>
      {blocks.map((block, i) => renderBlock(block, i, onToggleLine))}
    </div>
  );
}
