import { isoToday, isoYesterday } from '../utils/date.js';

const SCHEMA_VERSION = 2;

const DEFAULT_WEBAPP_URL = 'https://script.google.com/macros/s/AKfycbyGoe0rdQk2qMKOtT7WP3ZX49b_78jJUOhK5Z3zYLOT6_SGZdI3c-BLxd59isKfPTob/exec';

// These defaults are only applied on first run (no localStorage data).
const DEFAULT_RESP = [
  { id: 'yo',   nombre: 'Yo',   color: 'pu', emoji: '👤' },
  { id: 'papa', nombre: 'Papá', color: 'am', emoji: '👴' },
];

const DEFAULT_TARS = [
  { id: 'VISA_GALICIA',   nombre: 'Visa Galicia',        vt: 'variable', vd: null, limite: 0 },
  { id: 'VISA_BCO_CTES',  nombre: 'Visa Bco Ctes',       vt: 'variable', vd: null, limite: 0 },
  { id: 'MC_GALICIA',     nombre: 'Mastercard Galicia',  vt: 'variable', vd: null, limite: 0 },
  { id: 'NX',             nombre: 'NX',                  vt: 'fijo',     vd: 10,   limite: 0 },
];

// ── Migration ────────────────────────────────────────────────────────────────

/**
 * v1 → v2:
 * - Add `version` field.
 * - Normalize `ultReg` from locale 'DD/M/YYYY' to ISO 'YYYY-MM-DD' so
 *   streak comparisons are locale-independent.
 */
export function migrateV1(data) {
  if (data.ultReg && /^\d{1,2}\/\d{1,2}\/\d{4}$/.test(data.ultReg)) {
    const [d, m, y] = data.ultReg.split('/');
    data.ultReg = `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  data.version = SCHEMA_VERSION;
  return data;
}

// ── Load ─────────────────────────────────────────────────────────────────────

function loadFromStorage() {
  try {
    const version = parseInt(localStorage.getItem('fp_version') || '0', 10);
    const data = {
      version,
      txs:    JSON.parse(localStorage.getItem('fp_txs')   || '[]'),
      pend:   JSON.parse(localStorage.getItem('fp_pend')  || '[]'),
      url:    localStorage.getItem('fp_url') || DEFAULT_WEBAPP_URL,
      resp:   JSON.parse(localStorage.getItem('fp_resp')  || JSON.stringify(DEFAULT_RESP)),
      tars:   JSON.parse(localStorage.getItem('fp_tars')  || JSON.stringify(DEFAULT_TARS)),
      metas:  JSON.parse(localStorage.getItem('fp_metas') || '[]'),
      pres:   JSON.parse(localStorage.getItem('fp_pres')  || '{}'),
      codes:  JSON.parse(localStorage.getItem('fp_codes') || '{}'),
      racha:  parseInt(localStorage.getItem('fp_racha')   || '0', 10),
      ultReg: localStorage.getItem('fp_ultReg') || '',
    };
    return version < SCHEMA_VERSION ? migrateV1(data) : data;
  } catch {
    return emptyState();
  }
}

function emptyState() {
  return {
    version: SCHEMA_VERSION,
    txs: [], pend: [], url: '',
    resp: structuredClone(DEFAULT_RESP),
    tars: structuredClone(DEFAULT_TARS),
    metas: [], pres: {}, codes: {},
    racha: 0, ultReg: '',
  };
}

// ── State ─────────────────────────────────────────────────────────────────────

export const ST = loadFromStorage();

// ── Persistence ───────────────────────────────────────────────────────────────

let saveHook = null;
/** Register a callback to run after every save (used for UI status updates). */
export function onSaveCallback(fn) { saveHook = fn; }

export function save() {
  try {
    localStorage.setItem('fp_version', String(SCHEMA_VERSION));
    localStorage.setItem('fp_txs',   JSON.stringify(ST.txs.slice(0, 3000)));
    localStorage.setItem('fp_pend',  JSON.stringify(ST.pend));
    localStorage.setItem('fp_resp',  JSON.stringify(ST.resp));
    localStorage.setItem('fp_tars',  JSON.stringify(ST.tars));
    localStorage.setItem('fp_metas', JSON.stringify(ST.metas));
    localStorage.setItem('fp_pres',  JSON.stringify(ST.pres));
    localStorage.setItem('fp_codes', JSON.stringify(ST.codes));
    localStorage.setItem('fp_racha', String(ST.racha));
    localStorage.setItem('fp_ultReg', ST.ultReg);
  } catch (err) {
    console.error('[Guita] Error al guardar en localStorage:', err);
  } finally {
    saveHook?.();
  }
}

// ── Streak ────────────────────────────────────────────────────────────────────

/**
 * Update the daily streak counter.
 * Uses ISO dates (YYYY-MM-DD) to be locale-independent and timezone-stable.
 * Safe to call multiple times per day — only increments once.
 */
export function actualizarRacha() {
  const hoy = isoToday();
  if (ST.ultReg === hoy) return;
  ST.racha = ST.ultReg === isoYesterday() ? ST.racha + 1 : 1;
  ST.ultReg = hoy;
}

// ── Lookup helpers ────────────────────────────────────────────────────────────

export function respById(id) {
  return ST.resp.find(r => r.id === id) ?? { nombre: id || 'Yo', color: 'pu', emoji: '👤' };
}

export function tarById(id) {
  return ST.tars.find(t => t.id === id) ?? { nombre: id || 'Desconocida', limite: 0 };
}
