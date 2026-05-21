import { describe, it, expect } from 'vitest';

// store.js llama loadFromStorage() al importar. En Node, localStorage no existe
// pero el try-catch de loadFromStorage captura el ReferenceError y retorna emptyState().
// Por eso ST tiene los valores default y migrateV1 se puede testear como función pura.
import { migrateV1, migrateV2, respById, tarById, ST } from '../src/state/store.js';

// ── migrateV1 ─────────────────────────────────────────────────────────────────

describe('migrateV1', () => {
  it('convierte fecha locale D/M/YYYY a ISO YYYY-MM-DD', () => {
    const data = { ultReg: '5/3/2024' };
    expect(migrateV1(data).ultReg).toBe('2024-03-05');
  });

  it('convierte fecha locale DD/MM/YYYY a ISO YYYY-MM-DD', () => {
    const data = { ultReg: '31/12/2023' };
    expect(migrateV1(data).ultReg).toBe('2023-12-31');
  });

  it('no modifica fechas ya en formato ISO', () => {
    const data = { ultReg: '2024-03-05' };
    expect(migrateV1(data).ultReg).toBe('2024-03-05');
  });

  it('asigna version = 2 al objeto', () => {
    const data = { ultReg: '' };
    expect(migrateV1(data).version).toBe(2);
  });

  it('maneja ultReg vacío sin lanzar error', () => {
    const data = { ultReg: '' };
    expect(() => migrateV1(data)).not.toThrow();
    expect(migrateV1(data).ultReg).toBe('');
  });

  it('muta y retorna el mismo objeto (no crea uno nuevo)', () => {
    const data = { ultReg: '5/3/2024' };
    expect(migrateV1(data)).toBe(data);
  });
});

// ── respById ──────────────────────────────────────────────────────────────────

describe('respById', () => {
  it('retorna el responsable principal por id', () => {
    const r = respById('yo');
    expect(r.nombre).toBe('Yo');
    expect(r.id).toBe('yo');
  });

  it('retorna el segundo responsable por id', () => {
    const r = respById('papa');
    expect(r.nombre).toBe('Papá');
  });

  it('retorna fallback para id inexistente', () => {
    const r = respById('nadie');
    expect(r.nombre).toBe('nadie');
    expect(r.color).toBe('pu');
    expect(r.emoji).toBe('👤');
  });

  it('retorna fallback con nombre "Yo" para string vacío', () => {
    expect(respById('').nombre).toBe('Yo');
  });

  it('retorna fallback con nombre "Yo" para undefined', () => {
    expect(respById(undefined).nombre).toBe('Yo');
  });
});

// ── tarById ───────────────────────────────────────────────────────────────────

describe('tarById', () => {
  it('retorna la tarjeta correcta por id', () => {
    const t = tarById('VISA_GALICIA');
    expect(t.nombre).toBe('Visa Galicia');
    expect(t.id).toBe('VISA_GALICIA');
  });

  it('retorna tarjeta NX con vencimiento fijo día 10', () => {
    const t = tarById('NX');
    expect(t.nombre).toBe('NX');
    expect(t.vt).toBe('fijo');
    expect(t.vd).toBe(10);
  });

  it('retorna fallback para id inexistente', () => {
    const t = tarById('TARJETA_FANTASY');
    expect(t.nombre).toBe('TARJETA_FANTASY');
    expect(t.limite).toBe(0);
  });

  it('retorna fallback con nombre "Desconocida" para string vacío', () => {
    expect(tarById('').nombre).toBe('Desconocida');
  });

  it('retorna fallback con nombre "Desconocida" para undefined', () => {
    expect(tarById(undefined).nombre).toBe('Desconocida');
  });
});

// ── ST defaults ───────────────────────────────────────────────────────────────

describe('ST (estado inicial en entorno sin localStorage)', () => {
  it('tiene arrays vacíos para txs, pend, metas', () => {
    expect(ST.txs).toEqual([]);
    expect(ST.pend).toEqual([]);
    expect(ST.metas).toEqual([]);
  });

  it('tiene dos responsables default', () => {
    expect(ST.resp).toHaveLength(2);
    expect(ST.resp[0].id).toBe('yo');
    expect(ST.resp[1].id).toBe('papa');
  });

  it('tiene cuatro tarjetas default', () => {
    expect(ST.tars).toHaveLength(4);
    expect(ST.tars.map(t => t.id)).toContain('VISA_GALICIA');
    expect(ST.tars.map(t => t.id)).toContain('NX');
  });

  it('tiene resumenes vacío por defecto', () => {
    expect(ST.resumenes).toEqual({});
  });
});

// ── migrateV2 ─────────────────────────────────────────────────────────────────

describe('migrateV2', () => {
  it('agrega resumenes: {} si no existe', () => {
    const data = { version: 2 };
    expect(migrateV2(data).resumenes).toEqual({});
  });

  it('no sobreescribe resumenes existentes', () => {
    const existing = { id1: { pagado: true } };
    const data = { version: 2, resumenes: existing };
    expect(migrateV2(data).resumenes).toBe(existing);
  });

  it('asigna version = 3 al objeto', () => {
    const data = { version: 2 };
    expect(migrateV2(data).version).toBe(3);
  });

  it('muta y retorna el mismo objeto', () => {
    const data = { version: 2 };
    expect(migrateV2(data)).toBe(data);
  });
});
