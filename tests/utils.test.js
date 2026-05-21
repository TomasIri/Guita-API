import { describe, it, expect } from 'vitest';
import { fmt, pct, cv, cvb } from '../src/utils/money.js';
import { escapeHTML, csvField } from '../src/utils/sanitize.js';
import { mesKey, mesStr, txMes, isoToday, isoYesterday } from '../src/utils/date.js';
import { generateId } from '../src/utils/id.js';

// ── money.js ──────────────────────────────────────────────────────────────────

describe('fmt', () => {
  it('formats zero', () => expect(fmt(0)).toBe('$0'));
  it('formats positive integer', () => expect(fmt(1000)).toBe('$1.000'));
  it('formats null/undefined as $0', () => {
    expect(fmt(null)).toBe('$0');
    expect(fmt(undefined)).toBe('$0');
  });
  it('rounds decimals', () => expect(fmt(1234.7)).toBe('$1.235'));
  it('formats large number', () => expect(fmt(1000000)).toBe('$1.000.000'));
});

describe('pct', () => {
  it('returns correct percentage', () => expect(pct(1, 4)).toBe(25));
  it('returns 0 when denominator is 0', () => expect(pct(5, 0)).toBe(0));
  it('rounds to nearest integer', () => expect(pct(1, 3)).toBe(33));
  it('returns 100 when equal', () => expect(pct(5, 5)).toBe(100));
});

describe('cv / cvb', () => {
  it('cv wraps in CSS var', () => expect(cv('pu')).toBe('var(--pu)'));
  it('cvb wraps in CSS var background', () => expect(cvb('re')).toBe('var(--reb)'));
});

// ── sanitize.js ───────────────────────────────────────────────────────────────

describe('escapeHTML', () => {
  it('escapes angle brackets', () => expect(escapeHTML('<script>')).toBe('&lt;script&gt;'));
  it('escapes ampersand', () => expect(escapeHTML('a & b')).toBe('a &amp; b'));
  it('escapes double quotes', () => expect(escapeHTML('"hello"')).toBe('&quot;hello&quot;'));
  it('escapes single quotes', () => expect(escapeHTML("it's")).toBe("it&#x27;s"));
  it('handles null/undefined', () => {
    expect(escapeHTML(null)).toBe('');
    expect(escapeHTML(undefined)).toBe('');
  });
  it('passes through safe string', () => expect(escapeHTML('hello world')).toBe('hello world'));
});

describe('csvField', () => {
  it('wraps in quotes if contains comma', () => expect(csvField('a,b')).toBe('"a,b"'));
  it('doubles internal quotes', () => expect(csvField('say "hi"')).toBe('"say ""hi"""'));
  it('wraps if contains newline', () => expect(csvField('line1\nline2')).toBe('"line1\nline2"'));
  it('returns plain string when no special chars', () => expect(csvField('hello')).toBe('hello'));
  it('handles null as empty string', () => expect(csvField(null)).toBe(''));
});

// ── date.js ───────────────────────────────────────────────────────────────────

describe('mesKey', () => {
  it('formats as YYYY-MM', () => expect(mesKey(new Date(2024, 0, 15))).toBe('2024-01'));
  it('pads single-digit month', () => expect(mesKey(new Date(2024, 8, 1))).toBe('2024-09'));
  it('formats December correctly', () => expect(mesKey(new Date(2023, 11, 31))).toBe('2023-12'));
});

describe('txMes', () => {
  const txs = [
    { fecha: '15/01/2024', tipo: 'Gasto', monto: 100 },
    { fecha: '20/01/2024', tipo: 'Ingreso', monto: 500 },
    { fecha: '05/02/2024', tipo: 'Gasto', monto: 200 },
    { fecha: null, tipo: 'Gasto', monto: 50 },
    { fecha: '01/01', tipo: 'Gasto', monto: 30 },
  ];

  it('returns transactions for the correct month', () => {
    const result = txMes(txs, new Date(2024, 0, 1));
    expect(result).toHaveLength(2);
    expect(result[0].monto).toBe(100);
    expect(result[1].monto).toBe(500);
  });

  it('filters to a different month', () => {
    const result = txMes(txs, new Date(2024, 1, 1));
    expect(result).toHaveLength(1);
    expect(result[0].monto).toBe(200);
  });

  it('excludes transactions with null fecha', () => {
    const result = txMes(txs, new Date(2024, 0, 1));
    expect(result.every(t => t.fecha !== null)).toBe(true);
  });

  it('excludes transactions with malformed fecha', () => {
    const result = txMes(txs, new Date(2024, 0, 1));
    expect(result.every(t => t.fecha?.split('/').length === 3)).toBe(true);
  });

  it('returns empty array for month with no transactions', () => {
    expect(txMes(txs, new Date(2024, 5, 1))).toHaveLength(0);
  });
});

describe('isoToday / isoYesterday', () => {
  it('isoToday returns YYYY-MM-DD format', () => {
    expect(isoToday()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('isoYesterday returns YYYY-MM-DD format', () => {
    expect(isoYesterday()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('isoYesterday is one day before isoToday', () => {
    const today = new Date(isoToday());
    const yesterday = new Date(isoYesterday());
    const diff = today - yesterday;
    expect(diff).toBe(86_400_000);
  });
});

// ── id.js ─────────────────────────────────────────────────────────────────────

describe('generateId', () => {
  it('returns a string', () => expect(typeof generateId()).toBe('string'));
  it('returns a UUID v4 format', () => {
    expect(generateId()).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  });
  it('generates unique IDs', () => {
    const ids = new Set(Array.from({ length: 100 }, generateId));
    expect(ids.size).toBe(100);
  });
});
