import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Printer } from 'lucide-react';
import { Button } from '../ui/Button';
import { cn } from '../../lib/cn';
import '../../styles/print.css';

/**
 * This route's paper size/orientation and on-screen layout mode — see the module comment at the
 * top of `styles/print.css` for what each one means and how the print CSS realises it.
 *  - 'a5-card' — one card on A5. The default, and the only shape that existed before this type
 *    did; `InvitationPrintPage` keeps behaving exactly as it always has.
 *  - 'a4-document' — a plain flowing A4 document. Pages using this mark their own logical row
 *    groups with the `print-avoid-break` class (a table's guest list, a schedule block, a menu
 *    section) rather than relying on PrintPageLayout to wrap everything in one break-inside guard.
 *  - 'a4-card-grid' — a fixed 2-column grid of small cards on A4. Pages using this render each
 *    card as a direct child carrying the `print-card-grid-cell` class.
 */
export type PrintPageSize = 'a5-card' | 'a4-document' | 'a4-card-grid';

/** The `@page` override each non-default `pageSize` injects — see the "why a `<style>` tag"
 *  paragraph in `styles/print.css`'s module comment. `'a5-card'` needs no entry: it is what
 *  print.css's own top-level `@page` rule already gives every route for free. */
const PAGE_OVERRIDE: Partial<Record<PrintPageSize, string>> = {
  'a4-document': '@page { size: A4 portrait; margin: 18mm; }',
  'a4-card-grid': '@page { size: A4 portrait; margin: 10mm; }',
};

/** On-screen preview width per mode — A5's narrower single card vs the two A4 modes' wider sheet. */
const AREA_WIDTH: Record<PrintPageSize, string> = {
  'a5-card': 'max-w-lg',
  'a4-document': 'max-w-3xl',
  'a4-card-grid': 'max-w-3xl',
};

interface PrintPageLayoutProps {
  title: string;
  children: ReactNode;
  /** Defaults to `'a5-card'` — omitting it reproduces this component's original, only behaviour. */
  pageSize?: PrintPageSize;
}

/**
 * Shared chrome for every `src/pages/print/*` route: a screen-only toolbar (a Back link and a
 * Print button that calls `window.print()`) above the route's own content, wrapped for whichever
 * `pageSize` the route asked for. Plain browser print, on a normal authenticated React page — no
 * PDF library, per CLAUDE.md's dependency-avoidance list; the `@page` rule in force (this
 * component's own override, or print.css's A5 default when there isn't one) is what gives the OS
 * print dialog its default paper size, and "print to PDF" is simply the browser's own print
 * target, not a separate code path this app implements.
 */
export function PrintPageLayout({ title, children, pageSize = 'a5-card' }: PrintPageLayoutProps) {
  const navigate = useNavigate();
  const pageOverride = PAGE_OVERRIDE[pageSize];

  return (
    <div className="min-h-dvh bg-canvas">
      {/* A plain <style> tag mounted alongside this route's content — see styles/print.css's
          module comment for why this, rather than a second selector-scoped @page rule, is how a
          route picks its own paper size. */}
      {pageOverride && <style>{pageOverride}</style>}

      <div className="print-toolbar sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-separator bg-surface px-4 py-3">
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-sm font-medium text-text-secondary transition-colors hover:bg-hover hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-plum-400"
        >
          <ArrowLeft size={15} aria-hidden="true" />
          Back
        </button>
        <p className="truncate text-sm font-medium text-text-primary">{title}</p>
        <Button type="button" size="sm" onClick={() => window.print()}>
          <Printer size={14} aria-hidden="true" />
          Print
        </Button>
      </div>

      <div className={cn('print-area mx-auto p-4 lg:p-6', AREA_WIDTH[pageSize])}>
        {pageSize === 'a4-card-grid' ? (
          <div className="print-card-grid">{children}</div>
        ) : pageSize === 'a4-document' ? (
          <div>{children}</div>
        ) : (
          <div className="print-card">{children}</div>
        )}
      </div>
    </div>
  );
}
