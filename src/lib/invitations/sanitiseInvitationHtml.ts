/**
 * `html` mode: the escape hatch for a family who wants an invitation the closed design spec
 * (`designSpec.ts`) cannot express, at the cost of the app no longer understanding the design.
 *
 * READ THIS BEFORE CHANGING ANYTHING HERE.
 *
 * The security boundary for generated HTML is the **sandboxed iframe**, not this file. The markup
 * is rendered into an `<iframe sandbox srcdoc="…">` whose sandbox token list deliberately omits
 * `allow-scripts` (see `INVITATION_IFRAME_SANDBOX` below), which makes every script in the
 * document inert at the browser level — inline `<script>`, `onclick=`, `javascript:` hrefs, all of
 * it — regardless of what this function did or missed.
 *
 * That ordering matters because a hand-rolled regex HTML sanitiser is a well-known way to build
 * something that LOOKS safe and is not: comment tricks, malformed nesting, mutation XSS and
 * exotic encodings all defeat pattern-matching, and this codebase deliberately carries no
 * `DOMPurify`-class dependency. So this function is **defence in depth and tidiness** — it strips
 * the obviously-hostile and obviously-useless so the stored design is clean and a future reader is
 * not misled about what the markup contains. It is explicitly NOT the thing standing between a
 * guest and an XSS.
 *
 * If the sandbox attribute is ever loosened to include `allow-scripts`, this file stops being
 * adequate and a real sanitiser (or a different architecture) is required.
 */

/**
 * The sandbox token list for the preview iframe, in one place so the decision is reviewable.
 *
 * `allow-same-origin` is NOT included either: without it the frame gets an opaque origin, so even
 * if scripts were somehow enabled they could not reach the parent's storage, cookies or Supabase
 * session. The frame needs neither — it renders static markup.
 */
export const INVITATION_IFRAME_SANDBOX = '';

/** Generous for a one-page invitation; bounds what a single jsonb row can carry. */
const MAX_HTML_LENGTH = 60_000;

/** Elements with no place in a static invitation, removed with their contents. */
const FORBIDDEN_WITH_CONTENT = ['script', 'iframe', 'object', 'embed', 'noscript', 'template'];

/** Elements removed but whose contents are kept (a stray wrapper should not eat the text). */
const FORBIDDEN_TAG_ONLY = ['form', 'input', 'button', 'select', 'textarea', 'link', 'meta', 'base'];

export interface SanitiseResult {
  html: string;
  /** What was taken out, for the designer's "we adjusted this" note. Never shown to guests. */
  removed: string[];
}

function stripElementWithContent(html: string, tag: string): { html: string; hit: boolean } {
  const re = new RegExp(`<${tag}\\b[^>]*>[\\s\\S]*?<\\/${tag}\\s*>`, 'gi');
  const selfClosing = new RegExp(`<${tag}\\b[^>]*\\/?>`, 'gi');
  const before = html;
  const next = html.replace(re, '').replace(selfClosing, '');
  return { html: next, hit: next !== before };
}

function stripTagOnly(html: string, tag: string): { html: string; hit: boolean } {
  const re = new RegExp(`<\\/?${tag}\\b[^>]*>`, 'gi');
  const before = html;
  const next = html.replace(re, '');
  return { html: next, hit: next !== before };
}

/**
 * Never throws. Returns markup with the executable-looking parts removed, plus a list of what went
 * — the caller decides whether to tell the user or silently accept the tidied version.
 */
export function sanitiseInvitationHtml(raw: unknown): SanitiseResult {
  const removed: string[] = [];

  if (typeof raw !== 'string' || !raw.trim()) {
    return { html: '', removed: ['There was no markup to render.'] };
  }

  let html = raw;

  if (html.length > MAX_HTML_LENGTH) {
    html = html.slice(0, MAX_HTML_LENGTH);
    removed.push(`Markup was longer than ${MAX_HTML_LENGTH} characters and was truncated.`);
  }

  // HTML comments first: `<!-- <script> -->` style tricks otherwise survive the passes below and
  // can be re-parsed as live markup by a browser recovering from malformed nesting.
  html = html.replace(/<!--[\s\S]*?-->/g, '');

  for (const tag of FORBIDDEN_WITH_CONTENT) {
    const result = stripElementWithContent(html, tag);
    html = result.html;
    if (result.hit) removed.push(`<${tag}> was removed.`);
  }

  for (const tag of FORBIDDEN_TAG_ONLY) {
    const result = stripTagOnly(html, tag);
    html = result.html;
    if (result.hit) removed.push(`<${tag}> was removed.`);
  }

  // Inline event handlers in any quoting style, including unquoted (`onclick=alert(1)`).
  const beforeHandlers = html;
  html = html.replace(/\son[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '');
  if (html !== beforeHandlers) removed.push('Inline event handlers were removed.');

  // Scheme-bearing URLs that can execute or smuggle a document. `data:image/...` is deliberately
  // left alone — an inlined image is the normal way a generated design carries its own artwork.
  const beforeSchemes = html;
  html = html.replace(/(?:javascript|vbscript)\s*:/gi, 'blocked:');
  html = html.replace(/data\s*:\s*text\/html/gi, 'blocked:');
  if (html !== beforeSchemes) removed.push('Script-bearing URLs were neutralised.');

  return { html: html.trim(), removed };
}
