// All colours come from CSS variables defined in theme/tokens.css. Do not add hex values here.
const v = (n) => `rgb(var(--${n}) / <alpha-value>)`;
module.exports = {
  content: ['./src/**/*.{ts,tsx}'],
  darkMode: ['class', '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        brand: { primary: v('brand-primary'), 'primary-fg': v('brand-primary-fg'), a1: v('brand-accent-1'), a2: v('brand-accent-2'), a3: v('brand-accent-3') },
        bg: v('bg'), surface: v('surface'), 'surface-2': v('surface-2'), line: v('line'),
        ink: v('ink'), 'ink-2': v('ink-2'), 'ink-3': v('ink-3'),
        good: v('good'), warn: v('warn'), bad: v('bad'), info: v('info'),
      },
      fontFamily: { sans: ['var(--font-sans)'], ar: ['var(--font-arabic)'] },
      borderRadius: { card: 'var(--radius-card)', ctl: 'var(--radius-control)' },
      boxShadow: { card: 'var(--shadow-card)', pop: 'var(--shadow-pop)' },
    },
  },
  plugins: [],
};
