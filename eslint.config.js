import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import tseslint from 'typescript-eslint';

/*
  The design-system bans, ported from CRM_NEW/eslint.config.js.

  This is a fully independent sub-project (own package.json, tsconfig, vite config, and this
  eslint config) — it does not extend or share rules with the CRM root, and it ratchets its own
  lint baseline via scripts/lint-baseline.cjs. The ban set is copied here so the same design
  discipline applies to this app's own fresh code from day one, rather than being written down
  as prose in CLAUDE.md and drifting the way the CRM's did before its own rules existed.

  They match string literals and template chunks rather than JSX attributes, because a
  className here will be as often a `cn(...)` argument or a ternary branch as a plain attribute.
  All are 'warn', so they surface through `npm run lint:baseline`'s ratchet: counts may fall
  freely and can never rise.
*/
const SHARED_SYNTAX_BANS = [
  {
    // Dates must not be formatted against the browser's locale — this app is UK-only and
    // 06/10 vs 10/06 is a different date, with nothing on screen to say which.
    selector:
      'CallExpression[callee.property.name=/^toLocale(Date|Time)String$/]:not([arguments.0.type=Literal])',
    message:
      'Locale-dependent date formatting. Use formatDate/formatDateTime/formatTime from lib/format.ts (once it exists), or pass an explicit "en-GB".',
  },
  {
    selector:
      "CallExpression[callee.object.type='NewExpression'][callee.object.callee.name='Date'][callee.property.name='toLocaleString']:not([arguments.0.type=Literal])",
    message:
      'Locale-dependent date formatting. Use formatDateTime from lib/format.ts (once it exists), or pass an explicit "en-GB".',
  },
  {
    // Native dialogs block the main thread and paint browser chrome over an app installed to
    // the home screen.
    selector:
      "CallExpression[callee.object.name='window'][callee.property.name=/^(confirm|alert|prompt)$/]",
    message:
      'Use confirmDialog() from hooks/useConfirm for decisions, showToast() from hooks/useToast for status (once they exist), or a sheet with a real field where free text is wanted.',
  },
  {
    // transition-all animates layout properties off the compositor and picks up properties
    // nobody intended to animate. Name the properties instead.
    selector: "Literal[value=/(^|\\s)transition-all(\\s|$)/]",
    message:
      'Use `transition` (colour/opacity/shadow/transform) or an explicit list such as `transition-[width]`.',
  },
  {
    // A hex literal in Tailwind's arbitrary-value brackets. Only the `-[#…]` form, so a raw hex
    // used deliberately elsewhere (an inline style, an email template) is unaffected.
    selector:
      "Literal[value=/-\\[#[0-9A-Fa-f]{3,8}\\]/], TemplateElement[value.raw=/-\\[#[0-9A-Fa-f]{3,8}\\]/]",
    message:
      'Hardcoded colour. Use a token from tailwind.config.ts / src/styles/tokens.css once the design system lands (Stage 2).',
  },
  {
    // Three or more columns with no breakpoint in front of them. Not two: a label/value pair
    // is a perfectly good 390px layout. Three columns at 390px is not.
    selector:
      "Literal[value=/(^|\\s)grid-cols-([3-9]|1[0-2])(\\s|$)/], TemplateElement[value.raw=/(^|\\s)grid-cols-([3-9]|1[0-2])(\\s|$)/]",
    message:
      'Unprefixed multi-column grid. Start at grid-cols-1 (or 2) and widen at a breakpoint — this app is installed to the home screen at 390px with zoom locked, so there is no pinching out of a three-column row.',
  },
  {
    // A dialog panel claiming to be a button, purely to satisfy jsx-a11y/interactive-supports-focus
    // with a stopPropagation onClick. Narrow on purpose: requires BOTH role="button" and an
    // onClick whose body is a stopPropagation call, so a genuine clickable card/row is unaffected.
    selector:
      "JSXOpeningElement:has(JSXAttribute[name.name='role'][value.value='button']):has(JSXAttribute[name.name='onClick'] ArrowFunctionExpression CallExpression[callee.property.name='stopPropagation'])",
    message:
      'This panel is claiming to be a button so that a stopPropagation onClick passes jsx-a11y. Use a Sheet/dialog component whose backdrop only closes on a press that started on the backdrop, so nothing needs stopping, and the panel gets role="dialog" instead.',
  },
  {
    // `focus:` fires on mouse clicks too, so a ring meant for keyboard users flashes on every
    // press. The trailing [a-z[-] is load-bearing: a Tailwind variant is `focus:` glued to a
    // utility, while English writes `focus: ` with a space.
    selector:
      "Literal[value=/(^|\\s)focus:[a-z[-]/], TemplateElement[value.raw=/(^|\\s)focus:[a-z[-]/]",
    message:
      'Use focus-visible: — a bare focus: ring flashes on mouse clicks as well as keyboard focus.',
  },
];

/*
  Any pixel type size written as an arbitrary value, e.g. `text-[13px]`. Once the named type
  scale lands (Stage 2) an arbitrary size is always off it, and it silently opts out of the
  rung's bundled line-height too.
*/
const TYPE_SCALE_BAN = {
  selector:
    "Literal[value=/text-\\[\\d+(?:\\.\\d+)?px\\]/], TemplateElement[value.raw=/text-\\[\\d+(?:\\.\\d+)?px\\]/]",
  message:
    'Off the type scale. Use a named rung from tailwind.config.ts once the type scale lands (Stage 2) rather than an arbitrary pixel size.',
};

/*
  EVERY BUTTON SHOWS FOCUS.

  Does NOT ban a raw `<button>` — plenty are legitimately raw (an icon-only row action, a chip,
  a tab). It bans a button nobody can see focus on. A dynamic className is honoured: the
  selector looks for the string in ANY Literal or template chunk beneath the attribute rather
  than requiring it to be the whole value.
*/
const FOCUS_RING_BAN = {
  selector:
    "JSXOpeningElement[name.name='button']"
    + ":not(:has(JSXAttribute[name.name='className'] Literal[value=/focus-visible:/]))"
    + ":not(:has(JSXAttribute[name.name='className'] TemplateElement[value.raw=/focus-visible:/]))",
  message:
    'This button shows no focus ring, so a keyboard user cannot see it. Add a focus-visible: ring (never a bare focus:).',
};

export default tseslint.config(
  { ignores: ['dist'] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
      'jsx-a11y': jsxA11y,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': [
        'warn',
        { allowConstantExport: true },
      ],

      // Accessibility. Only the rules covering mistakes actually seen in the sibling CRM are
      // enabled, plus the baseline structural ones — not a wholesale jsx-a11y/recommended.
      'jsx-a11y/alt-text': 'error',
      'jsx-a11y/anchor-has-content': 'error',
      'jsx-a11y/aria-props': 'error',
      'jsx-a11y/aria-proptypes': 'error',
      'jsx-a11y/aria-unsupported-elements': 'error',
      'jsx-a11y/role-has-required-aria-props': 'error',
      'jsx-a11y/role-supports-aria-props': 'error',
      'jsx-a11y/click-events-have-key-events': 'warn',
      'jsx-a11y/no-static-element-interactions': 'warn',
      'jsx-a11y/interactive-supports-focus': 'warn',
      'jsx-a11y/label-has-associated-control': ['warn', { assert: 'either', depth: 3 }],
      'jsx-a11y/no-autofocus': ['warn', { ignoreNonDOM: true }],

      'no-restricted-globals': [
        'warn',
        {
          name: 'confirm',
          message: 'Use confirmDialog() from hooks/useConfirm (once it exists) — a native dialog blocks the main thread and paints browser chrome over an installed PWA.',
        },
        {
          name: 'alert',
          message: 'Use showToast() from hooks/useToast for status, or confirmDialog() from hooks/useConfirm for a decision (once they exist).',
        },
        {
          name: 'prompt',
          message: 'Use promptDialog() from hooks/useConfirm (once it exists) — a native prompt has no label, no validation, and no way to tell a cancel from an empty answer.',
        },
      ],

      'no-restricted-syntax': ['warn', ...SHARED_SYNTAX_BANS, TYPE_SCALE_BAN, FOCUS_RING_BAN],
    },
  },
);
