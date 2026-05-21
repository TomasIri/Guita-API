import { ST, save } from '../state/store.js';
import { toast } from '../utils/toast.js';

// ── URL validation ────────────────────────────────────────────────────────────

/**
 * Validate that a Google Apps Script web-app URL is structurally safe.
 * Only accepts HTTPS URLs on script.google.com under the /macros/s/ path.
 * Rejects javascript:, data:, file://, and any other scheme.
 */
export function validateUrl(url) {
  if (!url || typeof url !== 'string') return false;
  try {
    const u = new URL(url);
    return (
      u.protocol === 'https:' &&
      u.hostname === 'script.google.com' &&
      u.pathname.startsWith('/macros/s/')
    );
  } catch {
    return false;
  }
}

// ── Send ──────────────────────────────────────────────────────────────────────

/**
 * Send a single transaction to Google Sheets via Apps Script.
 * Silently no-ops if no valid URL is configured.
 *
 * Note: mode:'no-cors' means we cannot read the response. The caller is
 * responsible for retry logic (see doSync). A timeout is applied to avoid
 * hanging the UI indefinitely.
 */
export async function sendTx(tx) {
  if (!validateUrl(ST.url)) return;

  const params = new URLSearchParams({
    action:      'addTransaction',
    fecha:       tx.fecha,
    tipo:        tx.tipo,
    categoria:   tx.categoria,
    descripcion: tx.descripcion,
    monto:       String(tx.monto),
    moneda:      tx.moneda    || 'ARS',
    tipoPago:    tx.tipoPago  || '',
    tarjeta:     tx.tarjeta   || 'N/A',
    comprador:   tx.comprador || tx.responsable || 'Yo',
    esCuota:     tx.esCuota ? 'TRUE' : 'FALSE',
    cuotaActual: String(tx.cuotaActual || ''),
    cuotaTotal:  String(tx.cuotaTotal  || ''),
  });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    await fetch(ST.url + '?' + params.toString(), {
      method: 'GET',
      mode: 'no-cors',
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

// ── Pull from Sheets ──────────────────────────────────────────────────────────

/**
 * Fetch all transactions from Google Sheets and merge into local state.
 * Requires the Apps Script to handle action=getTransactions.
 * Returns the number of new transactions imported.
 */
export async function pullFromSheets() {
  if (!validateUrl(ST.url)) return 0;
  try {
    const res = await fetch(`${ST.url}?action=getTransactions`, {
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return 0;
    const json = await res.json();
    const rows = json.data ?? json.transactions ?? [];
    if (!Array.isArray(rows)) return 0;

    const existingIds = new Set(ST.txs.map(t => t.id));
    let count = 0;

    for (const r of rows) {
      const id = r.id || r.ID;
      if (!id || existingIds.has(id)) continue;
      const monto = parseFloat(String(r.monto || r.Monto || '0').replace(',', '.'));
      if (!monto || monto <= 0) continue;
      ST.txs.push({
        id,
        fecha:       r.fecha       || r.Fecha       || '',
        tipo:        r.tipo        || r.Tipo        || 'Gasto',
        categoria:   r.categoria   || r.Categoria   || 'Otros gastos',
        descripcion: r.descripcion || r.Descripcion || '',
        monto,
        moneda:      r.moneda      || r.Moneda      || 'ARS',
        tipoPago:    r.tipoPago    || r.tipopago    || r['Tipo de Pago'] || 'Efectivo',
        tarjeta:     r.tarjeta     || r.Tarjeta     || 'N/A',
        responsable: r.responsable || r.Responsable || 'yo',
        comprador:   r.comprador   || r.Comprador   || 'Yo',
        esCuota:     r.esCuota === 'TRUE' || r.EsCuota === 'TRUE',
        cuotaActual: r.cuotaActual || r.CuotaActual || '',
        cuotaTotal:  r.cuotaTotal  || r.CuotaTotal  || '',
      });
      existingIds.add(id);
      count++;
    }

    if (count > 0) {
      ST.txs.sort((a, b) => {
        const p = f => { const [d,m,y] = (f||'').split('/').map(Number); return new Date(y,m-1,d) || 0; };
        return p(b.fecha) - p(a.fecha);
      });
      save();
    }
    return count;
  } catch {
    return 0;
  }
}

// ── Sync queue ────────────────────────────────────────────────────────────────

export async function doSync() {
  const btn = document.getElementById('syncBtn');
  btn?.classList.add('spin');

  // Pull first (download new data from Sheets to this device)
  const pulled = await pullFromSheets();

  // Then push any pending local transactions
  if (ST.pend.length > 0) {
    const synced = [];
    for (const tx of ST.pend) {
      try {
        await sendTx(tx);
        synced.push(tx.id);
      } catch {
        // Retry on next doSync call.
      }
    }
    ST.pend = ST.pend.filter(t => !synced.includes(t.id));
    save();
    const msg = [
      pulled > 0 ? `${pulled} descargados` : '',
      synced.length > 0 ? `${synced.length} enviados` : '',
    ].filter(Boolean).join(', ');
    toast(msg ? msg + ' ✓' : 'Sin conexión', msg ? 'ok' : 'warn');
  } else if (pulled > 0) {
    toast(`${pulled} movimientos descargados ✓`, 'ok');
  } else {
    toast('Todo al día ✓', 'ok');
  }

  btn?.classList.remove('spin');
}

// ── Modal ─────────────────────────────────────────────────────────────────────

export function abrirModalUrl() {
  document.getElementById('urlInp').value = ST.url || '';
  document.getElementById('modalUrl').classList.add('open');
}

export function guardarUrl() {
  const raw = document.getElementById('urlInp').value.trim();

  if (raw && !validateUrl(raw)) {
    toast('URL inválida. Debe ser https://script.google.com/macros/s/…', 'err');
    return;
  }

  ST.url = raw;
  localStorage.setItem('fp_url', raw);
  document.getElementById('modalUrl').classList.remove('open');
  save();
  toast(raw ? 'URL guardada ✓' : 'URL eliminada', raw ? 'ok' : 'warn');
}
