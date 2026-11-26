/**
 * Programmatic mirror of theme/tokens.css for charts and PDF rendering.
 * ⚠ PLACEHOLDER brand values — replace with the Concentrix 2026 brand kit.
 * Charts read CSS variables at runtime (see cssVar) so dark mode follows automatically.
 */
export const tokens = {
  brandName: 'Concentrix',
  productName: 'Meridian',
  descriptor: { en: 'MET Revenue Intelligence', ar: 'ذكاء الإيرادات — منطقة الشرق الأوسط وتركيا' },
  // Colour-blind-safe categorical sequence (refers to CSS variables, not hex).
  chartSeries: ['--brand-primary', '--brand-accent-1', '--brand-accent-2', '--brand-accent-3', '--info', '--ink-3'],
  status: { good: '--good', warn: '--warn', bad: '--bad' },
} as const;

export const cssVar = (name: string, alpha = 1) => `rgb(var(${name}) / ${alpha})`;
