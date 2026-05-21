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
  if (!validateUrl(ST.url)) return false;

  const params = new URLSearchParams({
    action:      'addTransaction',
    id:          tx.id || '',
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

  const res = await fetch(ST.url + '?' + params.toString(), {
    method: 'GET',
    signal: AbortSignal.timeout(10_000),
  });
  return res.ok;
}

// ── Full bidirectional sync ───────────────────────────────────────────────────

function parseRow(r) {
  const monto = parseFloat(String(r.Monto || r.monto || '0').replace(',', '.'));
  if (!monto || monto <= 0) return null;
  // Google Sheets returns dates as ISO strings — convert back to DD/MM/YYYY
  const rawFecha = String(r.Fecha || r.fecha || '');
  let fecha = rawFecha;
  if (rawFecha.includes('T')) {
    const d = new Date(rawFecha);
    if (!isNaN(d)) {
      fecha = `${String(d.getUTCDate()).padStart(2,'0')}/${String(d.getUTCMonth()+1).padStart(2,'0')}/${d.getUTCFullYear()}`;
    }
  }

  // Sheets returns booleans for TRUE/FALSE strings
  const esCuota = r.EsCuota === 'TRUE' || r.EsCuota === true ||
                  r.esCuota === 'TRUE' || r.esCuota === true;

  return {
    id:          r.ID          || r.id          || '',
    fecha,
    tipo:        r.Tipo        || r.tipo        || 'Gasto',
    categoria:   r.Categoria   || r.categoria   || 'Otros gastos',
    descripcion: r.Descripcion || r.descripcion || '',
    monto,
    moneda:      r.Moneda      || r.moneda      || 'ARS',
    tipoPago:    r.TipoPago    || r.tipoPago    || 'Efectivo',
    tarjeta:     r.Tarjeta     || r.tarjeta     || 'N/A',
    responsable: r.Responsable || r.responsable || 'yo',
    comprador:   r.Comprador   || r.comprador   || 'Yo',
    esCuota,
    cuotaActual: String(r.CuotaActual || r.cuotaActual || ''),
    cuotaTotal:  String(r.CuotaTotal  || r.cuotaTotal  || ''),
  };
}

/**
 * Bidirectional sync with Google Sheets:
 * 1. Pull remote transactions not in local → merge into local
 * 2. Push local transactions not in Sheets → upload silently
 * Returns { pulled, pushed }.
 */
export async function fullSync(onProgress) {
  if (!validateUrl(ST.url)) return { pulled: 0, pushed: 0 };

  try {
    // Step 1 — fetch all Sheets data
    const res = await fetch(`${ST.url}?action=getTransactions`, {
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) return { pulled: 0, pushed: 0 };
    const json  = await res.json();
    const rows  = json.data ?? json.transactions ?? [];
    if (!Array.isArray(rows)) return { pulled: 0, pushed: 0 };

    // Remote IDs (what Sheets already has)
    const remoteIds  = new Set(rows.map(r => r.ID || r.id).filter(Boolean));
    const localIds   = new Set(ST.txs.map(t => t.id));

    // Step 2 — pull: add remote txs missing locally
    let pulled = 0;
    for (const r of rows) {
      const id = r.ID || r.id;
      if (!id || localIds.has(id)) continue;
      const tx = parseRow(r);
      if (!tx) continue;
      ST.txs.push(tx);
      localIds.add(id);
      pulled++;
    }

    // Step 3 — push: upload local txs missing in Sheets (oldest first)
    const toUpload = ST.txs.filter(t => t.id && !remoteIds.has(t.id)).reverse();
    let pushed = 0;
    for (const tx of toUpload) {
      try {
        const ok = await sendTx(tx);
        if (ok) { pushed++; onProgress?.(pushed, toUpload.length); }
      } catch { /* continue */ }
      if (toUpload.length > 1) await new Promise(r => setTimeout(r, 150));
    }

    if (pulled > 0 || pushed > 0) {
      const sortDate = f => { const [d,m,y] = (f||'').split('/').map(Number); return new Date(y,m-1,d)||0; };
      ST.txs.sort((a, b) => sortDate(b.fecha) - sortDate(a.fecha));
      save();
    }

    return { pulled, pushed };
  } catch {
    return { pulled: 0, pushed: 0 };
  }
}

// Keep pullFromSheets as a lightweight alias (used internally)
export const pullFromSheets = () => fullSync().then(r => r.pulled);

// ── Sync queue ────────────────────────────────────────────────────────────────

export async function doSync() {
  const btn = document.getElementById('syncBtn');
  btn?.classList.add('spin');

  const { pulled, pushed } = await fullSync();

  // Also flush pending queue
  if (ST.pend.length > 0) {
    const synced = [];
    for (const tx of ST.pend) {
      try { const ok = await sendTx(tx); if (ok) synced.push(tx.id); } catch {}
    }
    ST.pend = ST.pend.filter(t => !synced.includes(t.id));
    save();
  }

  const parts = [
    pulled > 0 ? `${pulled} descargados` : '',
    pushed > 0 ? `${pushed} subidos`      : '',
  ].filter(Boolean);
  toast(parts.length ? parts.join(', ') + ' ✓' : 'Todo al día ✓', 'ok');

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
