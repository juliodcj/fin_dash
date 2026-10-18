import { describe, expect, it } from 'vitest';
import { checkQuotes, relevantIssues } from './quality';
import type { PriceHistory, Trade } from './types';

/** dias úteis a partir de 2025-01-06 (segunda) */
function days(n: number): string[] {
  const out: string[] = [];
  const d = new Date(2025, 0, 6);
  while (out.length < n) {
    if (d.getDay() !== 0 && d.getDay() !== 6) out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`);
    d.setDate(d.getDate() + 1);
  }
  return out;
}

const hist = (closes: number[], dates = days(closes.length)): PriceHistory => ({
  ticker: 'B5P211',
  points: closes.map((c, i) => ({ date: dates[i], close: c, adj: c })),
  price: closes[closes.length - 1],
  changePct: null,
});

const buy = (date: string, price: number): Trade => ({ id: date, ticker: 'B5P211', side: 'buy', date, qty: 10, price, fees: 0 });

describe('checkQuotes', () => {
  it('não mexe em cotações boas', () => {
    const h = hist([100, 101, 100.5, 102, 101.8, 103]);
    const r = checkQuotes(h);
    expect(r.issues).toEqual([]);
    expect(r.history).toBe(h);
  });

  it('cotação parada vira estimativa entre as vizinhas e os lançamentos', () => {
    const closes = [70, ...Array(20).fill(71.25), 110, 111];
    const h = hist(closes);
    const d = h.points.map((p) => p.date);
    const r = checkQuotes(h, [buy(d[10], 90)]);
    expect(r.issues.map((x) => x.kind)).toEqual(['stale']);
    expect(r.issues[0]).toMatchObject({ from: d[1], to: d[20], fixed: true });
    const pts = r.history.points;
    expect(pts.map((p) => p.date)).toEqual(d);
    // o 1º ponto da sequência fica; o preço do lançamento vira âncora
    expect(pts[1]).toEqual(h.points[1]);
    expect(pts[10].close).toBeCloseTo(90, 10);
    expect(pts[10].est).toBe(true);
    // sobe sem degraus até a cotação válida seguinte
    for (let i = 2; i < 21; i++) expect(pts[i].close).toBeGreaterThan(pts[i - 1].close);
    expect(pts[21]).toEqual(h.points[21]);
  });

  it('valor congelado que reaparece não derruba a cotação real do meio', () => {
    // como no B5P211 do Yahoo: 71,25 parado, um dia real, 71,25 de novo, depois cotações reais
    const h = hist([71.25, ...Array(10).fill(71.25), 99.42, ...Array(8).fill(71.25), 101.92, 102]);
    const r = checkQuotes(h);
    expect(r.issues.map((x) => x.kind)).toEqual(['stale', 'stale']);
    const pts = r.history.points;
    expect(pts[11]).toEqual(h.points[11]);
    for (let i = 12; i < 20; i++) expect(pts[i].close).toBeGreaterThan(99.42);
  });

  it('cotação parada até hoje só gera aviso', () => {
    const r = checkQuotes(hist([100, 101, 99, 99, 99, 99, 99, 99]));
    expect(r.issues).toMatchObject([{ kind: 'stale', fixed: false }]);
    expect(r.history.points.some((p) => p.est)).toBe(false);
  });

  it('ponto fora da curva é trocado', () => {
    const r = checkQuotes(hist([100, 101, 70, 101.5, 102]));
    expect(r.issues).toMatchObject([{ kind: 'spike', fixed: true }]);
    expect(r.history.points[2].close).toBeGreaterThan(101);
    expect(r.history.points[2].close).toBeLessThan(101.5);
  });

  it('lacuna sem cotações é preenchida com dias úteis', () => {
    const r = checkQuotes(hist([100, 101, 120], ['2025-01-02', '2025-01-03', '2025-02-03']));
    expect(r.issues).toMatchObject([{ kind: 'gap', from: '2025-01-03', to: '2025-02-03' }]);
    const pts = r.history.points;
    expect(pts.length).toBe(3 + 20);
    expect(pts.every((p) => ![0, 6].includes(new Date(`${p.date}T12:00`).getDay()))).toBe(true);
  });

  it('salto grande que não se desfaz é só avisado', () => {
    const r = checkQuotes(hist([100, 101, 140, 141, 142]));
    expect(r.issues).toMatchObject([{ kind: 'jump', fixed: false }]);
    expect(r.history.points[2].close).toBe(140);
  });

  it('avisos antes da 1ª compra não importam', () => {
    const h = hist([70, ...Array(10).fill(71.25), 110, 111]);
    const r = checkQuotes(h);
    expect(relevantIssues(r.issues, [buy(h.points[12].date, 111)])).toEqual([]);
    expect(relevantIssues(r.issues, [buy(h.points[5].date, 90)])).toHaveLength(1);
  });
});
