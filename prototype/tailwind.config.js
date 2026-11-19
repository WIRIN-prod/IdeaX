const v = (n) => `var(--${n})`;
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: { extend: {
    colors: { canvas: v('canvas'), surface: v('surface'), line: v('line'), ink: v('ink'), mute: v('mute'), accent: v('accent'), 'accent-ink': v('accent-ink'), sunk: v('sunk') },
    fontFamily: { sans: ['ui-sans-serif', 'system-ui', 'sans-serif'], mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'] },
    boxShadow: { card: 'var(--shadow-card)', pop: 'var(--shadow-pop)' },
  } },
};
