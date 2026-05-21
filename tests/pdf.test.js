import { describe, it, expect } from 'vitest';

// pdf.js importa store.js (que usa localStorage) y toast.js (que usa el DOM).
// Ninguno de esos módulos falla al *importarse* en Node:
// - store.js tiene try-catch en loadFromStorage → retorna emptyState() sin localStorage
// - toast.js solo toca el DOM dentro de la función toast(), no al importar
// catAuto y generarCodigo son funciones puras y no usan DOM ni localStorage.
import { catAuto, generarCodigo } from '../src/services/pdf.js';

// ── catAuto ───────────────────────────────────────────────────────────────────

describe('catAuto — supermercados', () => {
  it('detecta COTO', () =>        expect(catAuto('COTO 5 PALERMO')).toBe('Supermercado'));
  it('detecta CARREFOUR', () =>   expect(catAuto('CARREFOUR EXPRESS')).toBe('Supermercado'));
  it('detecta JUMBO', () =>       expect(catAuto('JUMBO NORDELTA')).toBe('Supermercado'));
  it('detecta DISCO', () =>       expect(catAuto('DISCO TIGRE 14')).toBe('Supermercado'));
  it('detecta CHANGOMAS', () =>   expect(catAuto('CHANGOMAS ITUZAINGO')).toBe('Supermercado'));
});

describe('catAuto — farmacias', () => {
  it('detecta FARMACITY', () =>   expect(catAuto('FARMACITY PALERMO')).toBe('Farmacia'));
  it('detecta FARMA', () =>       expect(catAuto('FARMA 24HS QUILMES')).toBe('Farmacia'));
  it('detecta FARMACIA', () =>    expect(catAuto('FARMACIA DEL SOL')).toBe('Farmacia'));
});

describe('catAuto — restaurantes / delivery', () => {
  it('detecta RAPPI', () =>       expect(catAuto('RAPPI DELIVERY')).toBe('Restaurantes'));
  it('detecta PEDIDOSYA', () =>   expect(catAuto('PEDIDOSYA SUSHI')).toBe('Restaurantes'));
  it('detecta MCDONALD', () =>    expect(catAuto('MCDONALD 5103')).toBe('Restaurantes'));
});

describe('catAuto — transporte', () => {
  it('detecta UBER', () =>        expect(catAuto('UBER TRIP 12345')).toBe('Transporte'));
  it('detecta YPF', () =>         expect(catAuto('YPF PALERMO')).toBe('Transporte'));
  it('detecta CABIFY', () =>      expect(catAuto('CABIFY')).toBe('Transporte'));
});

describe('catAuto — streaming', () => {
  it('detecta NETFLIX', () =>     expect(catAuto('NETFLIX COM')).toBe('Streaming'));
  it('detecta SPOTIFY', () =>     expect(catAuto('SPOTIFY PREMIUM')).toBe('Streaming'));
  it('detecta DISNEY', () =>      expect(catAuto('DISNEY PLUS')).toBe('Streaming'));
});

describe('catAuto — salud', () => {
  it('detecta OSDE', () =>        expect(catAuto('OSDE CUOTA MENSUAL')).toBe('Salud'));
  it('detecta GIMNASIO', () =>    expect(catAuto('GIMNASIO SMARTFIT')).toBe('Salud'));
  it('detecta CLINICA', () =>     expect(catAuto('CLINICA CENTRAL SA')).toBe('Salud'));
});

describe('catAuto — servicios e internet', () => {
  it('detecta TELECOM', () =>     expect(catAuto('TELECOM ARGENTINA')).toBe('Internet/Celular'));
  it('detecta CLARO', () =>       expect(catAuto('CLARO MOVIL')).toBe('Internet/Celular'));
  it('detecta EDESUR', () =>      expect(catAuto('EDESUR SA')).toBe('Luz/Gas/Agua'));
  it('detecta METROGAS', () =>    expect(catAuto('METROGAS')).toBe('Luz/Gas/Agua'));
});

describe('catAuto — ropa y tecnología', () => {
  it('detecta ZARA', () =>        expect(catAuto('ZARA ALTO PALERMO')).toBe('Ropa y Calzado'));
  it('detecta FRAVEGA', () =>     expect(catAuto('FRAVEGA BELGRANO')).toBe('Tecnología'));
  it('detecta GARBARINO', () =>   expect(catAuto('GARBARINO CABALLITO')).toBe('Tecnología'));
});

describe('catAuto — fallback y case-insensitive', () => {
  it('devuelve Otros gastos para descripción desconocida', () =>
    expect(catAuto('QUIOSCO DON PEDRO 123')).toBe('Otros gastos'));

  it('es case-insensitive', () =>
    expect(catAuto('netflix mensual')).toBe('Streaming'));

  it('DIA con límite de palabra detecta supermercado', () =>
    expect(catAuto('DIA 1234 BS AS')).toBe('Supermercado'));

  it('no confunde BAR\\ b con GARBARINO (wordboundary)', () =>
    expect(catAuto('GARBARINO')).toBe('Tecnología'));
});

// ── generarCodigo ─────────────────────────────────────────────────────────────

describe('generarCodigo', () => {
  it('retorna un string', () =>
    expect(typeof generarCodigo('VISA', '01/05/2024', 1500, 'COTO')).toBe('string'));

  it('usa el separador pipe — 4 segmentos', () =>
    expect(generarCodigo('VISA', '01/05/2024', 1000, 'COTO').split('|')).toHaveLength(4));

  it('es determinístico con mismos inputs', () => {
    const a = generarCodigo('VISA', '01/05/2024', 1500, 'COTO PALERMO');
    const b = generarCodigo('VISA', '01/05/2024', 1500, 'COTO PALERMO');
    expect(a).toBe(b);
  });

  it('incluye la tarjeta en el código', () =>
    expect(generarCodigo('VISA_GALICIA', '01/05/2024', 1000, 'COTO')).toContain('VISA_GALICIA'));

  it('incluye la fecha en el código', () =>
    expect(generarCodigo('MC', '15/06/2024', 500, 'FARMACITY')).toContain('15/06/2024'));

  it('produce distintos códigos para distintos montos', () => {
    const a = generarCodigo('VISA', '01/05/2024', 1000, 'COTO');
    const b = generarCodigo('VISA', '01/05/2024', 2000, 'COTO');
    expect(a).not.toBe(b);
  });

  it('produce distintos códigos para distintas tarjetas', () => {
    const a = generarCodigo('VISA', '01/05/2024', 1000, 'COTO');
    const b = generarCodigo('MC', '01/05/2024', 1000, 'COTO');
    expect(a).not.toBe(b);
  });

  it('produce distintos códigos para distintas fechas', () => {
    const a = generarCodigo('VISA', '01/05/2024', 1000, 'COTO');
    const b = generarCodigo('VISA', '02/05/2024', 1000, 'COTO');
    expect(a).not.toBe(b);
  });

  it('normaliza monto a centavos — 1500.00 y 1500.004 producen el mismo código', () => {
    const a = generarCodigo('VISA', '01/05/2024', 1500.00, 'COTO');
    const b = generarCodigo('VISA', '01/05/2024', 1500.004, 'COTO');
    expect(a).toBe(b);
  });

  it('trunca la descripción a 15 caracteres alfanuméricos', () => {
    const largo  = generarCodigo('VISA', '01/05/2024', 1000, 'COTO PALERMO CENTRO SUR NORTE');
    const exacto = generarCodigo('VISA', '01/05/2024', 1000, 'COTOPALERMOCENT');
    expect(largo).toBe(exacto);
  });
});
