import type { Config } from 'tailwindcss';

// The token architecture: every value below is mirrored one-for-one from src/styles/tokens.css
// (CSS custom properties feed anything written in plain CSS; this feeds every `text-*` / `bg-*`
// / `border-*` utility). tokenContrast.test.ts asserts the two files agree and holds every ink
// value to a WCAG floor — see the comment at the top of tokens.css for how the ramps were
// derived. Keep the two files in step; the test fails loudly if they drift.
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        plum: {
          50:  '#F9F3F8',
          100: '#F2E4F0',
          200: '#E2C5DE',
          300: '#CE9CC7',
          400: '#B76EAE',
          500: '#984B8E',
          600: '#72386B',
          700: '#4A2545',
          800: '#381C35',
          900: '#271325',
          950: '#1A0D18',
        },
        // 600–950 are a separate ink sub-ramp, solved for contrast rather than for an even
        // visual step — see the comment in tokens.css. 50–500 are fills only.
        gold: {
          50:  '#F9F5EB',
          100: '#F2E8D2',
          200: '#E7D5AC',
          300: '#DCC286',
          400: '#D1AF61',
          500: '#C29A3C',
          600: '#856823',
          700: '#775C1E',
          800: '#604A17',
          900: '#4A3810',
          950: '#33270A',
        },
        bg:      '#FFFFFF',
        surface: '#FFFFFF',
        canvas:  '#F6F1EA',
        hover:   '#FBF8F3',
        separator: {
          DEFAULT: '#E6DED6',
          strong: '#8E8070',
          soft: '#EFEBE6',
          control: '#8E8070',
        },
        'separator-soft': '#EFEBE6',
        'separator-strong': '#8E8070',
        'border-control': '#8E8070',
        text: {
          primary:   '#2C1C28',
          secondary: '#574252',
          muted:     '#786674',
          faint:     '#837680',
          disabled:  '#90888E',
          inverse:   '#FFFFFF',
        },
        'text-primary':   '#2C1C28',
        'text-secondary': '#574252',
        'text-muted':     '#786674',
        'text-faint':     '#837680',
        'text-disabled':  '#90888E',
        'text-inverse':   '#FFFFFF',
        danger: {
          bg:     '#FAE3E0',
          text:   '#9E271A',
          fg:     '#D63A29',
          border: '#EABDB8',
        },
        warning: {
          bg:     '#F9E8D2',
          text:   '#825417',
          fg:     '#E68D19',
          border: '#E8D0B0',
        },
        success: {
          bg:     '#DAF1E5',
          text:   '#235C3E',
          fg:     '#358D5E',
          border: '#B3DBC6',
        },
        info: {
          bg:     '#E1ECF4',
          text:   '#225477',
          fg:     '#3674A1',
          border: '#BACFDE',
        },
      },
      fontFamily: {
        sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'sans-serif'],
        // Quoted because the family name genuinely is 'Fraunces Variable' — an unquoted family
        // name containing a second, unquoted word is still valid, but quoting matches the CSS
        // var in tokens.css and avoids the class of bug where a digit-bearing name silently
        // drops the whole declaration.
        serif: ['"Fraunces Variable"', 'Georgia', '"Times New Roman"', 'serif'],
        display: ['"Fraunces Variable"', 'Georgia', '"Times New Roman"', 'serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Consolas', '"Liberation Mono"', 'monospace'],
        hebrew: ['"Frank Ruhl Libre"', '"Noto Serif Hebrew"', 'serif'],
      },
      // See tokens.css for why 2xs exists and md does not.
      fontSize: {
        '2xs': ['10px',  { lineHeight: '1.4' }],
        xs:   ['11px',   { lineHeight: '1.4' }],
        sm:   ['12.5px', { lineHeight: '1.5' }],
        base: ['14px',   { lineHeight: '1.55' }],
        lg:   ['16px',   { lineHeight: '1.5' }],
        xl:   ['18px',   { lineHeight: '1.4' }],
        '2xl': ['22px',  { lineHeight: '1.25' }],
        '3xl': ['28px',  { lineHeight: '1.15' }],
        '4xl': ['36px',  { lineHeight: '1.1' }],
      },
      letterSpacing: {
        tight:   '-0.02em',
        tighter: '-0.025em',
      },
      borderRadius: {
        sm:  '6px',
        md:  '7px',
        lg:  '8px',
        xl:  '12px',
        '2xl': '14px',
      },
      boxShadow: {
        xs: '0 1px 2px rgba(44, 28, 40, 0.05)',
        sm: '0 1px 2px rgba(44, 28, 40, 0.05), 0 1px 3px rgba(44, 28, 40, 0.05)',
        md: '0 1px 3px rgba(44, 28, 40, 0.07), 0 4px 8px rgba(44, 28, 40, 0.05)',
        lg: '0 4px 12px rgba(44, 28, 40, 0.09), 0 8px 24px rgba(44, 28, 40, 0.07)',
      },
    },
  },
  plugins: [],
} satisfies Config;
