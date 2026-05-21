/** 'YYYY-MM' key for grouping transactions by month. */
export function mesKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/** Human-readable month label in Argentine Spanish. */
export function mesStr(d) {
  return d.toLocaleDateString('es-AR', { month: 'long', year: 'numeric' });
}

/** ISO date string for today: 'YYYY-MM-DD'. Locale-independent. */
export function isoToday() {
  const d = new Date();
  return [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, '0'),
    String(d.getDate()).padStart(2, '0'),
  ].join('-');
}

/** ISO date string for yesterday: 'YYYY-MM-DD'. Locale-independent. */
export function isoYesterday() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, '0'),
    String(d.getDate()).padStart(2, '0'),
  ].join('-');
}

/**
 * Filter transactions that belong to month `m`.
 * Expects tx.fecha in 'DD/MM/YYYY' format.
 */
export function txMes(txs, m) {
  const k = mesKey(m);
  return txs.filter(t => {
    if (!t.fecha) return false;
    const p = t.fecha.split('/');
    if (p.length !== 3) return false;
    return `${p[2]}-${p[1].padStart(2, '0')}` === k;
  });
}
