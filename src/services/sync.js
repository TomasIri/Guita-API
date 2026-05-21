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

// ── Sync queue ────────────────────────────────────────────────────────────────

export async function doSync() {
  const btn = document.getElementById('syncBtn');
  btn?.classList.add('spin');

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
    toast(
      synced.length > 0 ? `${synced.length} sincronizados ✓` : 'Sin conexión',
      synced.length > 0 ? 'ok' : 'warn',
    );
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
