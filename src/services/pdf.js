/* global pdfjsLib */
// pdfjsLib is loaded from CDN in index.html (script tag before the module).

import { ST, save, respById } from '../state/store.js';
import { generateId } from '../utils/id.js';
import { toast } from '../utils/toast.js';
import { escapeHTML } from '../utils/sanitize.js';
import { fmt } from '../utils/money.js';
import { sendTx } from './sync.js';
import { ICOS } from '../constants.js';

// ── Module state ──────────────────────────────────────────────────────────────

let movsPDF    = [];
let allSel     = true;
let procesando = false;

// ── Duplicate detection ───────────────────────────────────────────────────────

export function generarCodigo(tarjeta, fecha, monto, desc) {
  const m = Math.round(monto * 100);
  const d = desc.toUpperCase().replace(/[^A-Z0-9]/g, '').substring(0, 15);
  return `${tarjeta}|${fecha}|${m}|${d}`;
}

function verificarDuplicado(codigo, monto) {
  if (!ST.codes[codigo]) return { estado: 'nuevo' };
  const tx = ST.txs.find(t => t.id === ST.codes[codigo]);
  if (!tx) return { estado: 'nuevo' };
  if (Math.abs(tx.monto - monto) < 0.01) return { estado: 'duplicado', tx };
  return { estado: 'actualizado', tx };
}

// ── Auto-categorization ───────────────────────────────────────────────────────

export function catAuto(d) {
  const u = d.toUpperCase();
  if (/SUPER|COTO|DISCO|JUMBO|CARREFOUR|DIA\b|VEA|CHANGOMAS|WALMART|MAKRO/.test(u))       return 'Supermercado';
  if (/FARMACIA|FARMA|DROGUERIA|FARMACITY/.test(u))                                         return 'Farmacia';
  if (/MCDONALD|BURGER|RAPPI|PEDIDOSYA|SUSHI|PIZZA|CAFE\b|BAR\b|RESTO|RESTAURANT/.test(u)) return 'Restaurantes';
  if (/UBER\b|CABIFY|TAXI|PEAJE|YPF|SHELL|AXION|NAFTA/.test(u))                            return 'Transporte';
  if (/NETFLIX|SPOTIFY|DISNEY|AMAZON\b|HBO|FLOW|DIRECTV|APPLE\s*TV/.test(u))               return 'Streaming';
  if (/MEDICO|CLINICA|SANATORIO|HOSPITAL|OBRA SOCIAL|OSDE|SWISS|GIMNASIO|GYM\b|SMARTFIT|MEGATLON/.test(u)) return 'Salud';
  if (/TELECOM|PERSONAL\b|CLARO|MOVISTAR|FIBERTEL|CABLEVISION/.test(u))                    return 'Internet/Celular';
  if (/EDESUR|EDENOR|METROGAS|AYSA/.test(u))                                               return 'Luz/Gas/Agua';
  if (/ZARA|H&M|FALABELLA|ADIDAS|NIKE|ROPA|CALZADO/.test(u))                               return 'Ropa y Calzado';
  if (/APPLE|SAMSUNG|GARBARINO|MUSIMUNDO|FRAVEGA|MEGATONE/.test(u))                        return 'Tecnología';
  return 'Otros gastos';
}

// ── Progress UI ───────────────────────────────────────────────────────────────

function setProg(p, m) {
  const bar = document.getElementById('progB');
  const sub = document.getElementById('progS');
  if (bar) bar.style.width = p + '%';
  if (sub) sub.textContent = m;
}

function delay(ms) {
  return new Promise(r => setTimeout(r, ms));
}

// ── PDF parsing ───────────────────────────────────────────────────────────────

function parsearPDF(txt, tarId) {
  const lineas = txt.split('\n').map(l => l.trim()).filter(l => l.length > 4);
  const movs   = [];
  const vistos = new Set();

  const ignorar = /^(total|saldo|subtotal|vencimiento|fecha de|pago m[ií]n|periodo|resumen|tarjeta|cuenta|hola|estimado|haberes|d[ée]bito|cr[ée]dito|su resumen|detalle|cft|tea|pagos realizados|saldo anterior|intereses|impuesto|iva|ley|\*|—|___|p[áa]gina|page|\d+\s*$)/i;
  const cuotaRE  = /(?:cuota|cta\.?)\s*(\d+)[\s\/]+(\d+)/i;
  const codPats  = [
    /(?:n[°ú]?\.?\s*op|cod(?:igo)?|ref(?:erencia)?|aut(?:orizaci[oó]n)?)\s*:?\s*([A-Z0-9\-]{4,20})/i,
    /\b([A-Z]{2,4}\d{6,12})\b/,
    /\b(\d{10,15})\b(?=\s*$)/,
  ];
  const pats = [
    /^(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})\s+(.{3,55}?)\s+(\d{1,3}(?:\.\d{3})*,\d{2})\s*$/,
    /^(\d{1,2}[\/\-]\d{1,2})\s+(.{3,55}?)\s+(\d{1,3}(?:\.\d{3})*,\d{2})\s*$/,
    /^(.{3,55}?)\s+(\d{1,2}[\/\-]\d{1,2}(?:[\/\-]\d{2,4})?)\s+(\d{1,3}(?:\.\d{3})*,\d{2})\s*$/,
    /^(\d{1,2}[\/\-]\d{1,2}(?:[\/\-]\d{2,4})?)\s+(.{3,55}?)\s+(\d+,\d{2})\s*$/,
  ];

  for (let i = 0; i < lineas.length; i++) {
    const ln = lineas[i];
    if (ignorar.test(ln)) continue;

    for (const pat of pats) {
      const m = ln.match(pat);
      if (!m) continue;

      let fs, desc, ms;
      if (pat.source.startsWith('^(.{3')) { desc = m[1]; fs = m[2]; ms = m[3]; }
      else                                 { fs   = m[1]; desc = m[2]; ms = m[3]; }

      const monto = parseFloat(ms.replace(/\./g, '').replace(',', '.'));
      if (isNaN(monto) || monto <= 0 || monto > 5_000_000) break;

      desc = desc.replace(/\s+/g, ' ').trim();
      if (desc.length < 3) break;

      const pf    = fs.split(/[\/\-]/);
      const year  = pf[2] ? (pf[2].length === 2 ? '20' + pf[2] : pf[2]) : String(new Date().getFullYear());
      const fecha = pf[0].padStart(2, '0') + '/' + pf[1].padStart(2, '0') + '/' + year;

      // Look for a bank-assigned code in nearby lines.
      let codBanco = null;
      for (let j = Math.max(0, i - 2); j <= Math.min(lineas.length - 1, i + 2); j++) {
        for (const cp of codPats) {
          const cm = lineas[j].match(cp);
          if (cm?.[1]?.length >= 4) { codBanco = cm[1]; break; }
        }
        if (codBanco) break;
      }

      const codigoHash  = generarCodigo(tarId, fecha, monto, desc);
      const codigoFinal = codBanco ? `${tarId}|${codBanco}` : codigoHash;
      if (vistos.has(codigoFinal)) break;
      vistos.add(codigoFinal);

      const check = verificarDuplicado(codigoFinal, monto);

      // Parse installment info and validate it.
      let esCuota = false, ca = '', ct = '';
      const cm = desc.match(cuotaRE);
      if (cm) {
        const parsedCa = parseInt(cm[1], 10);
        const parsedCt = parseInt(cm[2], 10);
        if (parsedCa > 0 && parsedCt > 0 && parsedCa <= parsedCt) {
          esCuota = true;
          ca      = parsedCa;
          ct      = parsedCt;
          desc    = desc.replace(cuotaRE, '').replace(/\s+/g, ' ').trim();
        }
      }

      movs.push({
        fecha, desc: desc.substring(0, 55), monto,
        categoria: catAuto(desc),
        esCuota, cuotaActual: ca, cuotaTotal: ct,
        tarjeta: tarId, responsable: 'yo',
        codigoFinal, codBanco,
        estado: check.estado, txExistente: check.tx ?? null,
      });
      break;
    }
  }

  return movs.sort((a, b) => {
    const [da, ma, ya] = a.fecha.split('/').map(Number);
    const [db, mb, yb] = b.fecha.split('/').map(Number);
    return new Date(yb, mb - 1, db) - new Date(ya, ma - 1, da);
  });
}

// ── Preview table ─────────────────────────────────────────────────────────────

function mostrarPreview(movs) {
  document.getElementById('p1').style.display = 'none';
  document.getElementById('p2').style.display = 'block';
  document.getElementById('p3').classList.add('hidden');

  const n = movs.filter(m => m.estado === 'nuevo').length;
  const d = movs.filter(m => m.estado === 'duplicado').length;
  const u = movs.filter(m => m.estado === 'actualizado').length;

  document.getElementById('pdfSummary').innerHTML = `
    <div style="display:flex;gap:12px;flex-wrap:wrap">
      ${n > 0 ? `<div style="display:flex;align-items:center;gap:6px;font-size:13px"><span>✅</span><div><strong style="color:var(--gr)">${n}</strong> <span style="color:var(--t2)">nuevos</span></div></div>` : ''}
      ${d > 0 ? `<div style="display:flex;align-items:center;gap:6px;font-size:13px"><span>🔄</span><div><strong style="color:var(--am)">${d}</strong> <span style="color:var(--t2)">ya importados</span></div></div>` : ''}
      ${u > 0 ? `<div style="display:flex;align-items:center;gap:6px;font-size:13px"><span>🔵</span><div><strong style="color:var(--bl)">${u}</strong> <span style="color:var(--t2)">con cambios</span></div></div>` : ''}
    </div>
    <div style="font-size:11px;color:var(--t3);margin-top:6px">Los duplicados están desmarcados. Solo se importarán los nuevos.</div>`;

  document.getElementById('prevCnt').textContent = movs.length + ' movimientos detectados';

  // Build rows with escapeHTML on all user-derived text.
  document.getElementById('prevBody').innerHTML = movs.map((m, i) => {
    const checked = m.estado !== 'duplicado';
    const badge   =
      m.estado === 'duplicado'   ? '<span class="dup-bdg">Ya importado</span>' :
      m.estado === 'actualizado' ? '<span class="upd-bdg">Actualizado</span>'  :
                                   '<span class="new-bdg">Nuevo</span>';
    const cuotaInfo  = m.esCuota ? ` · c.${m.cuotaActual}/${m.cuotaTotal}` : '';
    const codInfo    = m.codBanco ? ` · #${escapeHTML(m.codBanco)}` : '';
    return `<tr style="${m.estado === 'duplicado' ? 'opacity:.5' : ''}">
      <td><input type="checkbox" ${checked ? 'checked' : ''} id="chk${i}" data-idx="${i}" style="width:16px;height:16px;cursor:pointer;accent-color:var(--pu)"></td>
      <td style="font-size:11px;color:var(--t2);white-space:nowrap">${escapeHTML(m.fecha)}</td>
      <td>
        <div style="font-size:12px;font-weight:500">${escapeHTML(m.desc)}${badge}</div>
        <div style="font-size:10px;color:var(--t3)">${escapeHTML(m.categoria)}${cuotaInfo}${codInfo}</div>
      </td>
      <td class="mono" style="color:var(--re)">$${Math.round(m.monto).toLocaleString('es-AR')}</td>
    </tr>`;
  }).join('');
}

// ── Public handlers (exposed to window in main.js) ────────────────────────────

export function toggleAll() {
  allSel = !allSel;
  movsPDF.forEach((m, i) => {
    const c = document.getElementById('chk' + i);
    if (c && m.estado !== 'duplicado') c.checked = allSel;
  });
}

export async function importarPDF() {
  const checks = [...document.querySelectorAll('#prevBody input[type=checkbox]')];
  const sel    = checks.filter(c => c.checked).map(c => movsPDF[parseInt(c.dataset.idx, 10)]);
  if (!sel.length) { toast('Seleccioná al menos uno', 'err'); return; }

  const btn = document.getElementById('importBtn');
  btn.classList.add('loading');

  let imp = 0, upd = 0;
  for (const m of sel) {
    if (m.estado === 'actualizado' && m.txExistente) {
      const idx = ST.txs.findIndex(t => t.id === m.txExistente.id);
      if (idx >= 0) { ST.txs[idx].monto = m.monto; ST.txs[idx].categoria = m.categoria; }
      upd++;
      btn.textContent = `Procesando ${imp + upd}/${sel.length}…`;
      continue;
    }

    const tx = {
      id:          generateId(),
      fecha:       m.fecha,
      tipo:        'Gasto',
      categoria:   m.categoria,
      descripcion: m.desc,
      monto:       m.monto,
      moneda:      'ARS',
      tipoPago:    'Crédito',
      tarjeta:     m.tarjeta,
      responsable: m.responsable || 'yo',
      comprador:   respById(m.responsable || 'yo').nombre,
      esCuota:     m.esCuota,
      cuotaActual: m.cuotaActual,
      cuotaTotal:  m.cuotaTotal,
    };

    ST.txs.unshift(tx);
    ST.codes[m.codigoFinal] = tx.id;

    try { await sendTx(tx); } catch { ST.pend.push(tx); }
    imp++;
    btn.textContent = `Procesando ${imp + upd}/${sel.length}…`;
  }

  save();
  // renderAll is called from main.js via the exposed window function.
  window.renderAll?.();

  btn.classList.remove('loading');
  document.getElementById('p2').style.display = 'none';
  document.getElementById('p3').classList.remove('hidden');

  const tarNombre = window._tarById?.(document.getElementById('pdfTarj').value)?.nombre ?? '';
  document.getElementById('r3n').textContent = imp;
  document.getElementById('r3l').textContent = `movimientos importados de ${escapeHTML(tarNombre)}`;
  document.getElementById('r3d').textContent = upd > 0 ? `${upd} movimientos actualizados` : '';
  toast(`${imp} importados${upd > 0 ? ', ' + upd + ' actualizados' : ''} ✓`, 'ok');
}

export function resetPDF() {
  document.getElementById('p1').style.display = 'block';
  document.getElementById('p2').style.display = 'none';
  document.getElementById('p3').classList.add('hidden');
  document.getElementById('progW').classList.add('hidden');

  const dz = document.getElementById('dz');
  dz.classList.remove('loaded', 'drag');
  document.getElementById('dzI').textContent = '📄';
  document.getElementById('dzT').textContent = 'Seleccioná el PDF';
  document.getElementById('dzS').textContent = 'Tocá aquí o arrastrá · solo .pdf';
  const inp = dz.querySelector('input');
  if (inp) inp.value = '';
  movsPDF    = [];
  procesando = false;
}

export function onDragOver(e)  { e.preventDefault(); document.getElementById('dz').classList.add('drag'); }
export function onDragLeave()  { document.getElementById('dz').classList.remove('drag'); }
export function onDrop(e)      {
  e.preventDefault();
  document.getElementById('dz').classList.remove('drag');
  const f = e.dataTransfer.files[0];
  if (f && f.type === 'application/pdf') procesarPDF(f);
  else toast('Solo PDFs', 'err');
}
export function onFileSelect(e) {
  const f = e.target.files[0];
  if (f) procesarPDF(f);
}

async function procesarPDF(file) {
  if (procesando) { toast('Ya se está procesando un PDF', 'warn'); return; }
  procesando = true;

  const dz = document.getElementById('dz');
  dz.classList.add('loaded');
  document.getElementById('dzI').textContent = '📋';
  document.getElementById('dzT').textContent = escapeHTML(file.name);
  document.getElementById('dzS').textContent = 'Leyendo...';
  document.getElementById('progW').classList.remove('hidden');
  setProg(10, 'Cargando...');

  try {
    const buf = await file.arrayBuffer();
    setProg(25, 'Analizando...');

    const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
    let txt = '';

    for (let pg = 1; pg <= pdf.numPages; pg++) {
      const page   = await pdf.getPage(pg);
      const ct     = await page.getTextContent();
      const items  = ct.items.sort((a, b) => {
        const dy = Math.round(b.transform[5]) - Math.round(a.transform[5]);
        return Math.abs(dy) > 4 ? dy : a.transform[4] - b.transform[4];
      });
      let ly = null;
      for (const it of items) {
        const y = Math.round(it.transform[5]);
        if (ly !== null && Math.abs(ly - y) > 5) txt += '\n';
        txt += it.str + ' ';
        ly = y;
      }
      txt += '\n';
      setProg(25 + Math.round((pg / pdf.numPages) * 55), `Página ${pg}/${pdf.numPages}`);
    }

    setProg(85, 'Detectando movimientos...');
    movsPDF = parsearPDF(txt, document.getElementById('pdfTarj').value);
    setProg(100, movsPDF.length + ' movimientos encontrados');
    await delay(300);
    document.getElementById('progW').classList.add('hidden');

    if (!movsPDF.length) {
      toast('No se detectaron movimientos', 'err');
      document.getElementById('dzS').textContent = 'Sin movimientos.';
      return;
    }
    mostrarPreview(movsPDF);
  } catch (err) {
    document.getElementById('progW').classList.add('hidden');
    toast('Error al leer el PDF', 'err');
    document.getElementById('dzS').textContent = 'Error.';
    console.error(err);
  } finally {
    procesando = false;
  }
}
