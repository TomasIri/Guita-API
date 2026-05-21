/** CSS variable reference, e.g. cv('pu') → 'var(--pu)' */
export const cv  = c => `var(--${c})`;
/** CSS variable background reference, e.g. cvb('pu') → 'var(--pub)' */
export const cvb = c => `var(--${c}b)`;

/** Format a number as Argentine peso string. */
export function fmt(n) {
  return '$' + Math.round(n ?? 0).toLocaleString('es-AR');
}

/** Calculate percentage a/b rounded to nearest integer. Returns 0 when b=0. */
export function pct(a, b) {
  return b > 0 ? Math.round((a / b) * 100) : 0;
}
