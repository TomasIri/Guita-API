import { ST, save, actualizarRacha, respById, tarById, onSaveCallback } from './state/store.js';
import { mesStr, txMes } from './utils/date.js';
import { fmt, fmtMoneda, pct, cv, cvb } from './utils/money.js';
import { escapeHTML, csvField } from './utils/sanitize.js';
import { toast } from './utils/toast.js';
import { sendTx, doSync, abrirModalUrl, guardarUrl } from './services/sync.js';
import { generateId } from './utils/id.js';
import { ICOS, TIPS, NECESIDADES, DESEOS } from './constants.js';
import {
  onDragOver, onDragLeave, onDrop, onFileSelect,
  toggleAll, importarPDF, resetPDF,
} from './services/pdf.js';

// ── Navigation state ──────────────────────────────────────────────────────────

let curNav = 0;
let curMes = new Date();

function mesLocal(m) { return txMes(ST.txs, m); }

// ── Navigation ────────────────────────────────────────────────────────────────

function goNav(i) {
  curNav = i;
  for (let j = 0; j < 7; j++) {
    document.getElementById('s' + j)?.classList.toggle('on', j === i);
    document.getElementById('n' + j)?.classList.toggle('on', j === i);
  }
  document.getElementById('fab').classList.toggle('hide', i >= 3);
  const R = { 0: renderHome, 1: renderMovs, 2: renderTars, 3: renderMetas, 4: renderStats, 6: renderConfig };
  R[i]?.();
}

function cambiarMes(d) {
  curMes = new Date(curMes.getFullYear(), curMes.getMonth() + d, 1);
  renderAll();
}

function irAlMes(fechaDDMMYYYY) {
  const parts = fechaDDMMYYYY.split('/');
  if (parts.length < 3) return;
  const m = parseInt(parts[1], 10) - 1;
  const y = parseInt(parts[2].length === 2 ? '20' + parts[2] : parts[2], 10);
  if (isNaN(m) || isNaN(y)) return;
  curMes = new Date(y, m, 1);
  goNav(1);
}

function renderAll() {
  renderHome();
  if (curNav === 1) renderMovs();
  if (curNav === 2) renderTars();
  if (curNav === 3) renderMetas();
  if (curNav === 4) renderStats();
}

// ── Monedita ──────────────────────────────────────────────────────────────────

function renderMonedita(aho, bal, gas, ing) {
  let cara, estado, msg;
  if (ing === 0)      { cara = '😐'; estado = 'Sin datos aún';                 msg = '¡Registrá tus movimientos para empezar!'; }
  else if (aho >= 30) { cara = '👑'; estado = '¡Sos una máquina!';            msg = 'Excelente tasa de ahorro. Seguí así, estás en racha.'; }
  else if (aho >= 20) { cara = '😄'; estado = 'Vas muy bien';                 msg = 'Tu ahorro está por encima del promedio. ¡Buen trabajo!'; }
  else if (aho >= 10) { cara = '🙂'; estado = 'Vas bien encaminado';          msg = 'Cada peso cuenta. Un poco más y llegas a tu meta.'; }
  else if (bal >= 0)  { cara = '😐'; estado = 'Cuidado con los gastos';       msg = 'Terminás en verde pero con poco margen. Revisá tus categorías.'; }
  else                { cara = '😟'; estado = 'Gastos por encima del ingreso'; msg = 'Estás gastando más de lo que entra. Hora de ajustar.'; }

  document.getElementById('moneditaFace').textContent   = cara;
  document.getElementById('moneditaEstado').textContent = estado;
  document.getElementById('moneditaMsg').textContent    = msg;
  document.getElementById('rachaNum').textContent       = ST.racha;
  document.getElementById('rachaBadge').style.display   = ST.racha === 0 ? 'none' : '';
}

// ── Tips ──────────────────────────────────────────────────────────────────────

function renderTip() {
  const t = TIPS[new Date().getDate() % TIPS.length];
  document.getElementById('tipIcon').textContent   = t.ico;
  document.getElementById('tipTitulo').textContent = t.titulo;
  document.getElementById('tipTexto').textContent  = ' ' + t.texto;
}

// ── Home ──────────────────────────────────────────────────────────────────────

function renderHome() {
  document.getElementById('mesLabel').textContent = mesStr(curMes);
  const txM = mesLocal(curMes);
  const txP = mesLocal(new Date(curMes.getFullYear(), curMes.getMonth() - 1, 1));

  const ing  = txM.filter(t => t.tipo === 'Ingreso').reduce((s, t) => s + t.monto, 0);
  const gas  = txM.filter(t => t.tipo === 'Gasto').reduce((s, t) => s + t.monto, 0);
  const ingP = txP.filter(t => t.tipo === 'Ingreso').reduce((s, t) => s + t.monto, 0);
  const gasP = txP.filter(t => t.tipo === 'Gasto').reduce((s, t) => s + t.monto, 0);
  const bal  = ing - gas;
  const aho  = pct(bal, ing);
  const meta = 25;

  document.getElementById('kI').textContent = fmt(ing);
  document.getElementById('kG').textContent = fmt(gas);
  document.getElementById('kB').textContent = fmt(bal);
  document.getElementById('kB').className   = 'kv ' + (bal >= 0 ? 'p' : 'r');
  document.getElementById('kA').textContent = aho + '%';

  if (ingP > 0) { const d = pct(ing - ingP, ingP); document.getElementById('kIsub').textContent = (d >= 0 ? '↑+' : '↓') + d + '% vs mes ant.'; }
  if (gasP > 0) { const d = pct(gas - gasP, gasP); document.getElementById('kGsub').textContent = (d > 0 ? '↑+' : '↓') + d + '% vs mes ant.'; }
  if (ingP || gasP) { const dd = bal - (ingP - gasP); document.getElementById('kBsub').textContent = (dd >= 0 ? '↑ +' : '↓ ') + fmt(Math.abs(dd)) + ' vs mes ant.'; }

  const ahoPct = Math.min(aho / meta * 100, 100);
  const pf = document.getElementById('kApf');
  pf.style.width = ahoPct + '%';
  pf.className   = 'kpf ' + (aho >= meta ? 'ok' : aho >= meta * .7 ? 'warn' : 'over');

  renderMonedita(aho, bal, gas, ing);

  const gR = ST.resp
    .map(r => ({ ...r, tot: txM.filter(t => t.tipo === 'Gasto' && t.responsable === r.id).reduce((s, t) => s + t.monto, 0) }))
    .filter(r => r.tot > 0)
    .sort((a, b) => b.tot - a.tot);

  document.getElementById('homeResp').innerHTML = gR.length
    ? gR.map(r => `<div class="rcrd"><div class="rav" style="background:${cvb(r.color)};color:${cv(r.color)}">${r.emoji}</div><div class="rinfo"><div class="rname">${escapeHTML(r.nombre)}</div><div class="rpct">${pct(r.tot, gas)}% del total</div></div><div class="ramt">${fmt(r.tot)}</div></div>`).join('')
    : '<div class="empty"><div style="font-size:13px">Sin gastos este mes</div></div>';

  document.getElementById('lastTx').innerHTML = ST.txs.length
    ? ST.txs.slice(0, 5).map(mkTx).join('')
    : '<div class="empty"><div style="font-size:32px;opacity:.4">📋</div><div style="font-size:13px">Tocá + para registrar el primer movimiento</div></div>';

  document.getElementById('homeCuotas').innerHTML = ST.tars.map(t => {
    const gastMes = txM.filter(tx => tx.tipo === 'Gasto' && tx.tarjeta === t.id).reduce((s, tx) => s + tx.monto, 0);
    const cuoMes  = txM.filter(tx => tx.esCuota && tx.tipo === 'Gasto' && tx.tarjeta === t.id).reduce((s, tx) => s + tx.monto, 0);
    if (gastMes === 0) return '';
    return `<div class="trow" onclick="goNav(2)" style="display:flex;align-items:center;justify-content:space-between;padding:11px 14px;border-bottom:.5px solid var(--b);cursor:pointer"><div style="display:flex;align-items:center;gap:8px"><div style="font-size:18px">💳</div><div><div style="font-size:13px;font-weight:500">${escapeHTML(t.nombre)}</div><div style="font-size:11px;color:var(--t3)">${cuoMes > 0 ? fmt(cuoMes) + ' en cuotas' : 'sin cuotas'}</div></div></div><div style="text-align:right"><div style="font-size:14px;font-family:'DM Mono',monospace;font-weight:600;color:var(--pu2)">${fmt(gastMes)}</div><div style="font-size:10px;color:var(--t3)">consumido</div></div></div>`;
  }).join('') || '<div class="empty"><div style="font-size:13px">Sin consumos este mes</div></div>';
}

// ── Transaction row ───────────────────────────────────────────────────────────

function mkTx(t) {
  const ico  = ICOS[t.categoria] ?? (t.tipo === 'Ingreso' ? '💚' : '💸');
  const bg   = t.tipo === 'Ingreso' ? 'var(--grb)' : 'var(--reb)';
  const r    = respById(t.responsable || 'yo');
  const rb   = r.id !== 'yo' ? `<span class="bdg" style="background:${cvb(r.color)};color:${cv(r.color)}">${r.emoji} ${escapeHTML(r.nombre)}</span>` : '';
  const cb   = t.esCuota ? `<span class="bdg" style="background:var(--pub);color:var(--pu2)">${t.cuotaActual}/${t.cuotaTotal}</span>` : '';
  const sign        = t.tipo === 'Ingreso' ? '+' : '-';
  const montoDisplay = t.moneda === 'USD'
    ? `<span style="color:var(--bl)">USD ${(t.monto ?? 0).toLocaleString('es-AR', { maximumFractionDigits: 2 })}</span>`
    : `${sign}${fmt(t.monto)}`;
  return `<div class="tx"><div class="ti" style="background:${bg}">${ico}</div><div class="tin"><div class="td">${escapeHTML(t.descripcion)}${rb}${cb}</div><div class="tm">${escapeHTML(t.fecha)} · ${escapeHTML(t.categoria)}</div></div><div class="ta ${t.tipo === 'Ingreso' ? 'g' : 'r'}">${montoDisplay}</div></div>`;
}

// ── Movements screen ──────────────────────────────────────────────────────────

let fTipo = 'todos', fResp = 'todos';

function setF(v, el) {
  fTipo = v;
  document.querySelectorAll('#fChips .chip').forEach(c => c.classList.remove('on'));
  el.classList.add('on');
  renderMovs();
}

function setFR(v, el) {
  fResp = v;
  document.querySelectorAll('#rChips .chip').forEach(c => c.classList.remove('on'));
  el.classList.add('on');
  renderMovs();
}

function poblarChipsResp() {
  document.getElementById('rChips').innerHTML =
    `<div class="chip on" onclick="setFR('todos',this)">Todos</div>` +
    ST.resp.map(r => `<div class="chip" onclick="setFR('${r.id}',this)">${r.emoji} ${escapeHTML(r.nombre)}</div>`).join('');
}

function renderMovs() {
  let txM = mesLocal(curMes);
  if (fTipo !== 'todos') txM = txM.filter(t => t.tipo === fTipo);
  if (fResp !== 'todos') txM = txM.filter(t => t.responsable === fResp);
  document.getElementById('allTx').innerHTML = txM.length
    ? txM.map(mkTx).join('')
    : '<div class="empty"><div style="font-size:13px">Sin movimientos con ese filtro</div></div>';
}

// ── Cards screen ──────────────────────────────────────────────────────────────

function renderTars() {
  const txM       = mesLocal(curMes);
  const hoy       = new Date();
  const diasHoy   = curMes.getMonth() === hoy.getMonth() && curMes.getFullYear() === hoy.getFullYear()
    ? hoy.getDate()
    : new Date(curMes.getFullYear(), curMes.getMonth() + 1, 0).getDate();
  const diasTotal = new Date(curMes.getFullYear(), curMes.getMonth() + 1, 0).getDate();

  document.getElementById('tarCard').innerHTML = ST.tars.map(t => {
    const gastoActual    = txM.filter(tx => tx.tipo === 'Gasto' && tx.tarjeta === t.id).reduce((s, tx) => s + tx.monto, 0);
    const cuotasActual   = txM.filter(tx => tx.esCuota && tx.tipo === 'Gasto' && tx.tarjeta === t.id).reduce((s, tx) => s + tx.monto, 0);
    const noRecurrentes  = gastoActual - cuotasActual;
    const proyeccionVar  = diasHoy > 0 && diasTotal > diasHoy ? (noRecurrentes / diasHoy) * diasTotal : noRecurrentes;
    const proyeccionTotal = cuotasActual + proyeccionVar;
    const limite         = t.limite || 0;
    const disponible     = limite > 0 ? Math.max(0, limite - proyeccionTotal) : null;
    const usadoPct       = limite > 0 ? Math.min(pct(gastoActual, limite), 100) : 0;
    const limiteColor    = usadoPct >= 90 ? 'var(--re)' : usadoPct >= 70 ? 'var(--am)' : 'var(--gr)';

    return `<div class="trow">
      <div class="trow-top">
        <div class="tleft"><div class="tico">💳</div><div><div class="tname">${escapeHTML(t.nombre)}</div><div class="tvenc">${t.vt === 'fijo' ? 'Vence día ' + t.vd : 'Vencimiento variable'}</div></div></div>
        <div class="tright"><div class="tcuota">${fmt(gastoActual)}</div><div class="tlabel">consumido</div></div>
      </div>
      ${limite > 0 ? `<div style="height:3px;background:var(--bg5);border-radius:2px;margin-bottom:8px;overflow:hidden"><div style="height:100%;width:${usadoPct}%;background:${limiteColor};border-radius:2px;transition:width .5s"></div></div>` : ''}
      <div class="trow-proyeccion">
        <div class="tpk"><div class="tpk-l">Cuotas mes</div><div class="tpk-v" style="color:var(--pu2)">${fmt(cuotasActual)}</div></div>
        <div class="tpk"><div class="tpk-l">Proyec. fin mes</div><div class="tpk-v" style="color:var(--am)">${fmt(proyeccionTotal)}</div></div>
        <div class="tpk"><div class="tpk-l">${limite > 0 ? 'Disponible' : 'Límite'}</div><div class="tpk-v" style="color:${disponible !== null ? (disponible < limite * .2 ? 'var(--re)' : 'var(--gr)') : 'var(--t3)'}">${disponible !== null ? fmt(disponible) : 'No seteado'}</div></div>
      </div>
    </div>`;
  }).join('') + `<div onclick="abrirModalTar()" style="padding:12px 14px;display:flex;align-items:center;gap:10px;cursor:pointer;color:var(--pu2);font-size:14px;font-weight:500"><div style="width:34px;height:34px;border-radius:8px;background:var(--pub);display:flex;align-items:center;justify-content:center;font-size:18px">+</div>Agregar tarjeta</div>`;

  const meses3 = [0, 1, 2].map(d => new Date(curMes.getFullYear(), curMes.getMonth() + d + 1, 1));
  const cuotasFuturasHTML = ST.tars.map(t => {
    const cuotasTx = ST.txs.filter(tx => tx.esCuota && tx.tipo === 'Gasto' && tx.tarjeta === t.id && tx.cuotaActual && tx.cuotaTotal);
    if (!cuotasTx.length) return '';
    const filas = meses3.map((m, idx) => {
      const total = cuotasTx.reduce((s, tx) => (tx.cuotaTotal - tx.cuotaActual >= idx + 1 ? s + tx.monto : s), 0);
      return `<div style="font-size:12px;font-family:'DM Mono',monospace;color:${total > 0 ? 'var(--pu2)' : 'var(--t3)'}">${fmt(total)}</div>`;
    });
    return `<div style="padding:11px 14px;border-bottom:.5px solid var(--b);display:flex;align-items:center;gap:10px"><div style="flex:1;font-size:13px;font-weight:500">${escapeHTML(t.nombre)}</div><div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:4px;text-align:center;min-width:180px">${filas.join('')}</div></div>`;
  }).filter(h => h).join('');

  const el = document.getElementById('cuotasFuturas');
  if (!cuotasFuturasHTML) {
    el.innerHTML = '<div class="empty"><div style="font-size:13px">Sin cuotas pendientes</div></div>';
  } else {
    const mesesLabels = meses3.map(m => m.toLocaleDateString('es-AR', { month: 'short' }));
    const headerHTML = `<div style="padding:8px 14px 6px;display:flex;align-items:center;gap:10px;border-bottom:.5px solid var(--b)"><div style="flex:1;font-size:10px;color:var(--t3);font-weight:600;text-transform:uppercase;letter-spacing:.06em">Tarjeta</div><div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:4px;text-align:center;min-width:180px">${mesesLabels.map(l => `<div style="font-size:10px;color:var(--t3);font-weight:600;text-transform:uppercase;letter-spacing:.06em">${l}</div>`).join('')}</div></div>`;
    el.innerHTML = headerHTML + cuotasFuturasHTML;
  }

  // Resúmenes importados
  const resEl = document.getElementById('resumenesCard');
  if (resEl) {
    const arr = Object.entries(ST.resumenes)
      .map(([id, r]) => ({ id, ...r }))
      .sort((a, b) => new Date(b.importadoEn) - new Date(a.importadoEn));
    resEl.innerHTML = !arr.length
      ? '<div class="empty"><div style="font-size:13px">Importá un PDF para ver los resúmenes</div></div>'
      : arr.map(r => {
          const tar = tarById(r.tarjeta);
          const pagBtn = r.pagado
            ? `<button onclick="marcarResumenPagado('${r.id}')" style="padding:5px 10px;background:var(--grb);border:.5px solid var(--gr);border-radius:8px;color:var(--gr);font-size:12px;cursor:pointer;font-family:'DM Sans',sans-serif">Pagado ✓</button>`
            : `<button onclick="marcarResumenPagado('${r.id}')" style="padding:5px 10px;background:var(--pub);border:.5px solid var(--pu);border-radius:8px;color:var(--pu2);font-size:12px;cursor:pointer;font-family:'DM Sans',sans-serif">Marcar pagado</button>`;
          return `<div style="padding:11px 14px;border-bottom:.5px solid var(--b);display:flex;align-items:center;gap:10px">
            <div style="flex:1">
              <div style="font-size:13px;font-weight:500">${escapeHTML(tar.nombre)} · ${escapeHTML(r.mes)}</div>
              <div style="font-size:11px;color:var(--t3)">${r.cantTx} movimientos · ${fmt(r.monto)}</div>
            </div>${pagBtn}
          </div>`;
        }).join('');
  }
}

function marcarResumenPagado(resumenId) {
  if (!ST.resumenes[resumenId]) return;
  ST.resumenes[resumenId].pagado = !ST.resumenes[resumenId].pagado;
  save();
  renderTars();
  toast(ST.resumenes[resumenId].pagado ? 'Resumen marcado como pagado ✓' : 'Resumen desmarcado', 'ok');
}

// ── Goals & Budget screen ─────────────────────────────────────────────────────

function renderMetas() {
  const metaEl = document.getElementById('metasCard');
  if (!ST.metas.length) {
    metaEl.innerHTML = '<div class="empty"><div style="font-size:32px;opacity:.4">🎯</div><div style="font-size:13px">No tenés metas aún.<br>Creá una para empezar.</div></div>';
  } else {
    metaEl.innerHTML = ST.metas.map((m, i) => {
      const p     = Math.min(pct(m.actual, m.objetivo), 100);
      const falta = Math.max(0, m.objetivo - m.actual);
      const color = p >= 100 ? 'var(--gr)' : p >= 70 ? 'var(--pu)' : p >= 40 ? 'var(--am)' : 'var(--re)';
      return `<div class="meta-item">
        <div class="meta-top"><div style="display:flex;align-items:center;gap:8px"><span style="font-size:18px">${m.emoji || '🎯'}</span><div class="meta-name">${escapeHTML(m.nombre)}</div></div><button onclick="borrarMeta(${i})" style="background:none;border:none;color:var(--t3);cursor:pointer;font-size:14px;padding:2px">✕</button></div>
        <div class="meta-prog"><div class="meta-pf" style="width:${p}%;background:${color}"></div></div>
        <div class="meta-sub"><span>${fmt(m.actual)} ahorrado</span><span>${p >= 100 ? '✓ META LOGRADA' : 'Faltan ' + fmt(falta)}</span></div>
        <div style="margin-top:8px;display:flex;gap:8px">
          <input type="number" placeholder="Agregar ahorro..." id="metaAdd${i}" style="flex:1;background:var(--bg3);border:.5px solid var(--b2);border-radius:var(--r2);padding:8px 10px;color:var(--t);font-size:13px;outline:none;font-family:'DM Sans',sans-serif" inputmode="decimal">
          <button onclick="sumarMeta(${i})" style="padding:8px 14px;background:var(--pub);border:.5px solid var(--pu);border-radius:var(--r2);color:var(--pu2);font-size:13px;font-weight:600;cursor:pointer;font-family:'DM Sans',sans-serif">+</button>
        </div>
      </div>`;
    }).join('');
  }

  const txM    = mesLocal(curMes);
  const gastos = txM.filter(t => t.tipo === 'Gasto');
  const presEl = document.getElementById('presCard');
  const cats   = Object.keys(ST.pres);
  if (!cats.length) {
    presEl.innerHTML = '<div class="empty"><div style="font-size:13px">Establecé límites por categoría<br>para controlar tus gastos.</div></div>';
  } else {
    presEl.innerHTML = cats.map(cat => {
      const lim    = ST.pres[cat];
      const gast   = gastos.filter(t => t.categoria === cat).reduce((s, t) => s + t.monto, 0);
      const p      = Math.min(pct(gast, lim), 100);
      const alerta = p >= 100 ? 'var(--re)' : p >= 80 ? 'var(--am)' : 'var(--gr)';
      return `<div class="pres-item">
        <div class="pres-ico">${ICOS[cat] || '💸'}</div>
        <div class="pres-info">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
            <div class="pres-name">${escapeHTML(cat)}</div>
            <button onclick="borrarPres('${escapeHTML(cat)}')" style="background:none;border:none;color:var(--t3);cursor:pointer;font-size:12px;padding:1px 4px">✕</button>
          </div>
          <div class="pres-prog"><div class="pres-pf" style="width:${p}%;background:${alerta}"></div></div>
        </div>
        <div class="pres-amt">
          <div class="pres-v" style="color:${alerta}">${p}%</div>
          <div class="pres-p">${fmt(gast)} / ${fmt(lim)}</div>
        </div>
      </div>`;
    }).join('');
  }

  const totalIng = txM.filter(t => t.tipo === 'Ingreso').reduce((s, t) => s + t.monto, 0);
  const totalGas = gastos.reduce((s, t) => s + t.monto, 0);
  const gas50    = gastos.filter(t => NECESIDADES.includes(t.categoria)).reduce((s, t) => s + t.monto, 0);
  const gas30    = gastos.filter(t => DESEOS.includes(t.categoria)).reduce((s, t) => s + t.monto, 0);
  const gas20    = totalIng - totalGas;
  const base     = totalIng || 1;
  const p50 = pct(gas50, base), p30 = pct(gas30, base), p20 = Math.max(0, pct(gas20, base));

  document.getElementById('regla5030').innerHTML = `
    <div style="font-size:13px;font-weight:500;margin-bottom:8px">Distribución de tu ingreso</div>
    <div class="regla-row">
      <div class="regla-seg" style="width:${p50}%;background:var(--bl)"></div>
      <div class="regla-seg" style="width:${p30}%;background:var(--am)"></div>
      <div class="regla-seg" style="flex:1;background:var(--gr)"></div>
    </div>
    <div class="regla-legend">
      <div class="regla-dot"><div class="regla-circ" style="background:var(--bl)"></div><span>Necesidades <strong style="color:var(--t)">${p50}%</strong> / ideal 50%</span></div>
      <div class="regla-dot"><div class="regla-circ" style="background:var(--am)"></div><span>Deseos <strong style="color:var(--t)">${p30}%</strong> / ideal 30%</span></div>
      <div class="regla-dot"><div class="regla-circ" style="background:var(--gr)"></div><span>Ahorro <strong style="color:var(--t)">${p20}%</strong> / ideal 20%</span></div>
    </div>
    <div style="font-size:11px;color:var(--t3);margin-top:8px;line-height:1.5">${totalIng > 0
      ? `Con ${fmt(totalIng)} de ingresos: idealmente ${fmt(totalIng * .5)} a necesidades, ${fmt(totalIng * .3)} a deseos y ${fmt(totalIng * .2)} al ahorro.`
      : 'Registrá ingresos para ver el análisis.'}</div>`;
}

// ── Stats screen ──────────────────────────────────────────────────────────────

function renderStats() {
  const txM       = mesLocal(curMes);
  const gastos    = txM.filter(t => t.tipo === 'Gasto');
  const totalGas  = gastos.reduce((s, t) => s + t.monto, 0);
  const totalIng  = txM.filter(t => t.tipo === 'Ingreso').reduce((s, t) => s + t.monto, 0);
  const hoy       = new Date();
  const diasHoy   = curMes.getMonth() === hoy.getMonth() && curMes.getFullYear() === hoy.getFullYear()
    ? hoy.getDate()
    : new Date(curMes.getFullYear(), curMes.getMonth() + 1, 0).getDate();
  const diasTotal = new Date(curMes.getFullYear(), curMes.getMonth() + 1, 0).getDate();

  document.getElementById('stGD').textContent  = fmt(totalGas / Math.max(1, diasHoy));
  document.getElementById('stCnt').textContent = txM.length;

  const maxG = [...gastos].sort((a, b) => b.monto - a.monto)[0];
  document.getElementById('stMax').textContent  = maxG ? fmt(maxG.monto) : '$0';
  document.getElementById('stMaxS').textContent = maxG ? (maxG.descripcion || '').substring(0, 22) : '';
  document.getElementById('stTkt').textContent  = fmt(gastos.length > 0 ? totalGas / gastos.length : 0);

  const proj = (totalGas / Math.max(1, diasHoy)) * diasTotal;
  document.getElementById('stProj').textContent  = fmt(proj);
  document.getElementById('stProjS').textContent = `Balance proyectado: ${fmt(totalIng - proj)}`;

  const byCat  = {};
  gastos.forEach(t => { byCat[t.categoria] = (byCat[t.categoria] || 0) + t.monto; });
  const cats   = Object.entries(byCat).sort((a, b) => b[1] - a[1]).slice(0, 8);
  const maxCat = cats[0]?.[1] ?? 1;

  document.getElementById('catBars').innerHTML = cats.length
    ? cats.map(([cat, monto]) => {
        const pres   = ST.pres[cat];
        const alerta = pres && monto >= pres ? 'var(--re)' : pres && monto >= pres * .8 ? 'var(--am)' : 'var(--pu)';
        return `<div class="cbar"><div class="cico">${ICOS[cat] || '💸'}</div><div class="cinfo"><div style="display:flex;justify-content:space-between"><div class="cname">${escapeHTML(cat)}</div>${pres ? `<div style="font-size:10px;color:${alerta}">${pct(monto, pres)}% del límite</div>` : ''}</div><div class="cprog"><div class="cpf" style="width:${pct(monto, maxCat)}%;background:${alerta}"></div></div></div><div class="camt"><div class="camtv">${fmt(monto)}</div><div class="cpct">${pct(monto, totalGas)}%</div></div></div>`;
      }).join('')
    : '<div class="empty"><div style="font-size:13px">Sin gastos</div></div>';

  document.getElementById('respStats').innerHTML = ST.resp.map(r => {
    const tot = gastos.filter(t => t.responsable === r.id).reduce((s, t) => s + t.monto, 0);
    return `<div class="rcrd"><div class="rav" style="background:${cvb(r.color)};color:${cv(r.color)}">${r.emoji}</div><div class="rinfo"><div class="rname">${escapeHTML(r.nombre)}</div><div class="rpct">${pct(tot, totalGas)}% del total</div></div><div class="ramt">${fmt(tot)}</div></div>`;
  }).join('');

  const m3 = [-2, -1, 0].map(d => {
    const m  = new Date(curMes.getFullYear(), curMes.getMonth() + d, 1);
    const tM = mesLocal(m);
    return {
      lbl: m.toLocaleDateString('es-AR', { month: 'short', year: '2-digit' }),
      ing: tM.filter(t => t.tipo === 'Ingreso').reduce((s, t) => s + t.monto, 0),
      gas: tM.filter(t => t.tipo === 'Gasto').reduce((s, t) => s + t.monto, 0),
    };
  });
  const maxV = Math.max(...m3.map(m => Math.max(m.ing, m.gas)), 1);

  document.getElementById('trend3m').innerHTML = `
    <div style="display:flex;gap:10px;align-items:flex-end;height:80px;margin-bottom:10px">
      ${m3.map(m => `<div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:4px"><div style="width:100%;display:flex;gap:3px;align-items:flex-end;height:62px"><div style="flex:1;background:var(--grb);border-radius:4px 4px 0 0;height:${pct(m.ing, maxV)}%;min-height:2px;border:.5px solid var(--gr)"></div><div style="flex:1;background:var(--reb);border-radius:4px 4px 0 0;height:${pct(m.gas, maxV)}%;min-height:2px;border:.5px solid var(--re)"></div></div><div style="font-size:10px;color:var(--t3);font-family:'DM Mono',monospace">${m.lbl}</div></div>`).join('')}
    </div>
    <div style="display:flex;gap:16px;justify-content:center">
      <div style="display:flex;align-items:center;gap:5px;font-size:11px;color:var(--t2)"><div style="width:8px;height:8px;background:var(--grb);border:.5px solid var(--gr);border-radius:50%"></div>Ingresos</div>
      <div style="display:flex;align-items:center;gap:5px;font-size:11px;color:var(--t2)"><div style="width:8px;height:8px;background:var(--reb);border:.5px solid var(--re);border-radius:50%"></div>Gastos</div>
    </div>`;
}

// ── Config screen ─────────────────────────────────────────────────────────────

function renderConfig() {
  document.getElementById('respCfg').innerHTML = ST.resp.map((r, i) =>
    `<div class="sitem"><div style="display:flex;align-items:center;gap:10px"><div style="width:32px;height:32px;border-radius:50%;background:${cvb(r.color)};color:${cv(r.color)};display:flex;align-items:center;justify-content:center;font-size:13px">${r.emoji}</div><div><div class="silabel">${escapeHTML(r.nombre)}</div><div class="sisub">${r.id}</div></div></div>${i > 0 ? `<button onclick="borrarResp(${i})" style="background:none;border:none;color:var(--re);cursor:pointer;font-size:16px;padding:4px">✕</button>` : '<span style="font-size:11px;color:var(--t3)">Principal</span>'}</div>`
  ).join('');

  document.getElementById('tarCfg').innerHTML = ST.tars.map((t, i) =>
    `<div class="sitem"><div style="display:flex;align-items:center;gap:10px"><div style="width:32px;height:32px;border-radius:8px;background:var(--pub);display:flex;align-items:center;justify-content:center;font-size:14px">💳</div><div><div class="silabel">${escapeHTML(t.nombre)}</div><div class="sisub">${t.vt === 'fijo' ? 'Día ' + t.vd : 'Variable'} · ${t.id}${t.limite ? ' · lim ' + fmt(t.limite) : ''}</div></div></div><button onclick="borrarTar(${i})" style="background:none;border:none;color:var(--re);cursor:pointer;font-size:16px;padding:4px">✕</button></div>`
  ).join('');
}

function updateStatusUI() {
  const u = document.getElementById('urlSt');
  if (u) u.textContent = ST.url ? '✓ Configurada' : 'Sin configurar';
  const p = document.getElementById('pendSt');
  if (p) p.textContent = ST.pend.length + ' pendientes';
  const d = document.getElementById('pdot');
  if (d) d.style.display = ST.pend.length > 0 ? 'block' : 'none';
}

// ── Transaction modal ─────────────────────────────────────────────────────────

let txT = 'gas', txR = 'yo', txCQ = false;

function openModalTx() {
  poblarRespTr();
  poblarTarSelect();
  document.getElementById('modalTx').classList.add('open');
  document.getElementById('iM').focus();
}

function closeTx() {
  document.getElementById('modalTx').classList.remove('open');
  resetTx();
}

function setTipo(t) {
  txT = t;
  document.getElementById('t-gas').className = 'tb ' + (t === 'gas' ? 'sel-gas' : '');
  document.getElementById('t-ing').className = 'tb ' + (t === 'ing' ? 'sel-ing' : '');
}

function onPago() {
  const cr = document.getElementById('iPago').value === 'Crédito';
  document.getElementById('tarGrp').classList.toggle('hidden', !cr);
  document.getElementById('cuotaSec').classList.toggle('hidden', !cr);
  if (!cr) { txCQ = false; document.getElementById('cuotaInp').classList.add('hidden'); }
}

function setCuota(v) {
  txCQ = v;
  document.getElementById('cqSi').className = 'tb ' + (v ? 'sel-pu' : '');
  document.getElementById('cqNo').className = 'tb ' + (!v ? 'sel-pu' : '');
  document.getElementById('cuotaInp').classList.toggle('hidden', !v);
}

function setRBtn(id, el) {
  txR = id;
  document.querySelectorAll('#respTr .tb').forEach(b => { b.className = 'tb'; });
  el.className = 'tb sel-' + respById(id).color;
}

function poblarRespTr() {
  document.getElementById('respTr').innerHTML = ST.resp.map(r =>
    `<button class="tb ${r.id === txR ? 'sel-' + r.color : ''}" onclick="setRBtn('${r.id}',this)">${r.emoji} ${escapeHTML(r.nombre)}</button>`
  ).join('');
}

function poblarTarSelect() {
  const html = ST.tars.map(t => `<option value="${t.id}">${escapeHTML(t.nombre)}</option>`).join('');
  const s = document.getElementById('iTarj');
  if (s) s.innerHTML = html;
  const p = document.getElementById('pdfTarj');
  if (p) p.innerHTML = html;
}

async function guardarTx() {
  const m = parseFloat(document.getElementById('iM').value);
  const d = document.getElementById('iD').value.trim();
  const c = document.getElementById('iC').value;
  if (!m || m <= 0) { toast('Ingresá un monto', 'err'); return; }
  if (!d)           { toast('Agregá una descripción', 'err'); return; }
  if (!c)           { toast('Elegí una categoría', 'err'); return; }

  const btn = document.getElementById('saveBtn');
  btn.classList.add('loading');
  btn.textContent = 'Guardando...';

  actualizarRacha();

  const tx = {
    id:          generateId(),
    fecha:       new Date().toLocaleDateString('es-AR'),
    tipo:        txT === 'gas' ? 'Gasto' : 'Ingreso',
    categoria:   c,
    descripcion: d,
    monto:       m,
    moneda:      'ARS',
    tipoPago:    document.getElementById('iPago').value,
    tarjeta:     document.getElementById('iPago').value === 'Crédito' ? document.getElementById('iTarj').value : 'N/A',
    responsable: txR,
    comprador:   respById(txR).nombre,
    esCuota:     txCQ,
    cuotaActual: txCQ ? parseInt(document.getElementById('iCN').value || '1', 10) : '',
    cuotaTotal:  txCQ ? parseInt(document.getElementById('iCT').value || '1', 10) : '',
  };

  ST.txs.unshift(tx);
  if (ST.url) {
    try   { await sendTx(tx); toast('Guardado en Sheets ✓', 'ok'); }
    catch { ST.pend.push(tx); toast('Guardado local'); }
  } else {
    toast('Guardado ✓', 'ok');
  }

  checkAlertaPres(tx);
  save();
  renderAll();

  btn.classList.remove('loading');
  btn.innerHTML = '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M5 12l5 5L20 7"/></svg> Guardar';
  closeTx();
}

function checkAlertaPres(tx) {
  if (tx.tipo !== 'Gasto' || !ST.pres[tx.categoria]) return;
  const gastCat = mesLocal(new Date()).filter(t => t.tipo === 'Gasto' && t.categoria === tx.categoria).reduce((s, t) => s + t.monto, 0);
  const lim = ST.pres[tx.categoria];
  if (gastCat >= lim)          toast(`⚠️ Superaste el límite de ${tx.categoria}`, 'warn');
  else if (gastCat >= lim * .8) toast(`⚠️ Cerca del límite en ${tx.categoria} (${pct(gastCat, lim)}%)`, 'warn');
}

function resetTx() {
  document.getElementById('iM').value    = '';
  document.getElementById('iD').value    = '';
  document.getElementById('iC').value    = '';
  document.getElementById('iPago').value = 'Efectivo';
  document.getElementById('tarGrp').classList.add('hidden');
  document.getElementById('cuotaSec').classList.add('hidden');
  document.getElementById('cuotaInp').classList.add('hidden');
  txT = 'gas'; txCQ = false;
  setTipo('gas');
  txR = 'yo';
  poblarRespTr();
}

// ── Goals CRUD ────────────────────────────────────────────────────────────────

function abrirModalMeta() {
  document.getElementById('metaNom').value   = '';
  document.getElementById('metaObj').value   = '';
  document.getElementById('metaAct').value   = '';
  document.getElementById('metaEmoji').value = '';
  document.getElementById('modalMeta').classList.add('open');
}

function guardarMeta() {
  const n = document.getElementById('metaNom').value.trim();
  const o = parseFloat(document.getElementById('metaObj').value) || 0;
  if (!n || !o) { toast('Completá nombre y objetivo', 'err'); return; }
  ST.metas.push({
    nombre:   n,
    objetivo: o,
    actual:   parseFloat(document.getElementById('metaAct').value) || 0,
    emoji:    document.getElementById('metaEmoji').value.trim() || '🎯',
  });
  save();
  document.getElementById('modalMeta').classList.remove('open');
  renderMetas();
  toast(n + ' creada ✓', 'ok');
}

function sumarMeta(i) {
  const v = parseFloat(document.getElementById('metaAdd' + i).value) || 0;
  if (!v) return;
  ST.metas[i].actual += v;
  save();
  renderMetas();
  if (ST.metas[i].actual >= ST.metas[i].objetivo) toast('🎉 ¡Meta ' + ST.metas[i].nombre + ' lograda!', 'ok');
  else toast('+' + fmt(v) + ' sumado a ' + ST.metas[i].nombre, 'ok');
}

function borrarMeta(i) {
  if (!confirm('¿Eliminar meta?')) return;
  ST.metas.splice(i, 1);
  save();
  renderMetas();
}

// ── Budget CRUD ───────────────────────────────────────────────────────────────

function abrirModalPres() {
  document.getElementById('pressLim').value = '';
  document.getElementById('modalPres').classList.add('open');
}

function guardarPres() {
  const cat = document.getElementById('pressCat').value;
  const lim = parseFloat(document.getElementById('pressLim').value) || 0;
  if (!lim) { toast('Ingresá un límite', 'err'); return; }
  ST.pres[cat] = lim;
  save();
  document.getElementById('modalPres').classList.remove('open');
  renderMetas();
  toast('Presupuesto guardado ✓', 'ok');
}

function borrarPres(cat) {
  delete ST.pres[cat];
  save();
  renderMetas();
}

// ── Responsables CRUD ─────────────────────────────────────────────────────────

let rColor = 'pu';

function abrirModalResp() {
  document.getElementById('rNom').value   = '';
  document.getElementById('rEmoji').value = '';
  rColor = 'pu';
  document.getElementById('modalResp').classList.add('open');
}

function setRC(c, el) {
  rColor = c;
  const cs = ['pu', 'am', 'bl', 'pi', 'cy'];
  document.querySelectorAll('#rColTr .tb').forEach((b, i) => { b.className = 'tb ' + (cs[i] === c ? 'sel-' + c : ''); });
}

function guardarResp() {
  const n = document.getElementById('rNom').value.trim();
  if (!n) { toast('Ingresá un nombre', 'err'); return; }
  const e  = document.getElementById('rEmoji').value.trim() || '👤';
  const id = n.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
  if (ST.resp.find(r => r.id === id)) { toast('Ya existe', 'warn'); return; }
  ST.resp.push({ id, nombre: n, color: rColor, emoji: e });
  save();
  poblarChipsResp();
  poblarRespTr();
  renderConfig();
  document.getElementById('modalResp').classList.remove('open');
  toast(n + ' agregado ✓', 'ok');
}

function borrarResp(i) {
  if (!confirm('¿Eliminar?')) return;
  const idEliminar = ST.resp[i].id;
  ST.txs.forEach(tx => { if (tx.responsable === idEliminar) tx.responsable = 'yo'; });
  ST.resp.splice(i, 1);
  save();
  poblarChipsResp();
  poblarRespTr();
  renderConfig();
  toast('Eliminado');
}

// ── Cards CRUD ────────────────────────────────────────────────────────────────

function abrirModalTar() {
  document.getElementById('tNom').value    = '';
  document.getElementById('tId').value     = '';
  document.getElementById('tVT').value     = 'variable';
  document.getElementById('tVDG').classList.add('hidden');
  document.getElementById('tLimite').value = '';
  document.getElementById('modalTar').classList.add('open');
}

function toggleVenc() {
  document.getElementById('tVDG').classList.toggle('hidden', document.getElementById('tVT').value !== 'fijo');
}

function guardarTar() {
  const n  = document.getElementById('tNom').value.trim();
  const id = (document.getElementById('tId').value.trim().toUpperCase().replace(/\s+/g, '_'))
    || n.toUpperCase().replace(/\s+/g, '_').replace(/[^A-Z0-9_]/g, '');
  if (!n) { toast('Ingresá un nombre', 'err'); return; }
  if (ST.tars.find(t => t.id === id)) { toast('Ya existe', 'warn'); return; }
  const vt  = document.getElementById('tVT').value;
  const vd  = vt === 'fijo' ? parseInt(document.getElementById('tVD').value, 10) || null : null;
  const lim = parseFloat(document.getElementById('tLimite').value) || 0;
  ST.tars.push({ id, nombre: n, vt, vd, limite: lim });
  save();
  poblarTarSelect();
  renderConfig();
  if (curNav === 2) renderTars();
  document.getElementById('modalTar').classList.remove('open');
  toast(n + ' agregada ✓', 'ok');
}

function borrarTar(i) {
  if (!confirm('¿Eliminar?')) return;
  const idEliminar = ST.tars[i].id;
  ST.txs.forEach(tx => { if (tx.tarjeta === idEliminar) tx.tarjeta = 'N/A'; });
  ST.tars.splice(i, 1);
  save();
  poblarTarSelect();
  renderConfig();
  toast('Eliminada');
}

// ── CSV & data ────────────────────────────────────────────────────────────────

function exportCSV() {
  const hdr  = 'ID,Fecha,Tipo,Categoría,Descripción,Monto,Moneda,Pago,Tarjeta,Responsable,Cuota';
  const rows = ST.txs.map(t => [
    t.id, t.fecha, t.tipo, t.categoria,
    csvField(t.descripcion || ''),
    t.monto, t.moneda || 'ARS', t.tipoPago || '',
    t.tarjeta || '', t.comprador || '',
    t.esCuota ? `${t.cuotaActual}/${t.cuotaTotal}` : '',
  ].join(','));
  const blob = new Blob([hdr + '\n' + rows.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'finanzas.csv';
  a.click();
  toast('CSV descargado ✓', 'ok');
}

function borrarDatos() {
  if (!confirm('¿Borrar todos los datos locales?\nEl Google Sheet NO se modifica.')) return;
  ['fp_txs', 'fp_pend', 'fp_codes', 'fp_metas', 'fp_pres', 'fp_racha', 'fp_ultReg'].forEach(k => localStorage.removeItem(k));
  ST.txs = []; ST.pend = []; ST.codes = {}; ST.metas = []; ST.pres = {};
  ST.racha = 0; ST.ultReg = '';
  save();
  renderAll();
  toast('Datos borrados', 'warn');
}

// ── Init ──────────────────────────────────────────────────────────────────────

onSaveCallback(updateStatusUI);

function init() {
  document.getElementById('hDate').textContent = new Date().toLocaleDateString('es-AR', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });
  poblarChipsResp();
  poblarTarSelect();
  setTipo('gas');
  renderTip();
  renderAll();
  updateStatusUI();
  if (ST.pend.length > 0) doSync();
}

// ── Expose to window for inline onclick handlers ──────────────────────────────

Object.assign(window, {
  goNav, cambiarMes, irAlMes,
  openModalTx, closeTx, setTipo, onPago, setCuota, setRBtn, guardarTx,
  abrirModalMeta, guardarMeta, sumarMeta, borrarMeta,
  abrirModalPres, guardarPres, borrarPres,
  abrirModalResp, setRC, guardarResp, borrarResp,
  abrirModalTar, toggleVenc, guardarTar, borrarTar,
  abrirModalUrl, guardarUrl, doSync,
  setF, setFR,
  exportCSV, borrarDatos, marcarResumenPagado,
  onDragOver, onDragLeave, onDrop, onFileSelect, toggleAll, importarPDF, resetPDF,
  renderAll,
  _tarById: tarById,
});

init();
