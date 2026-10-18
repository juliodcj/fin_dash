import { describe, expect, it } from 'vitest';
import { annualize, buildSeries, cdiFactors, ipcaFactors, isAnnualized, maxDrawdown, monthlyReturns, niceAxis, positions, qtyAt, stats, bench, windowFor, yearTable } from './finance';
import { parseNumberBR, pct } from './format';
import type { PriceHistory, Trade } from './types';

const hist = (ticker: string, pts: [string, number, number?][]): PriceHistory => ({
  ticker,
  points: pts.map(([date, close, adj]) => ({ date, close, adj: adj ?? close })),
  price: pts[pts.length - 1][1],
  changePct: null,
});
const trade = (p: Partial<Trade>): Trade => ({ id: Math.random().toString(), ticker: 'AAAA11', side: 'buy', date: '2024-01-02', qty: 10, price: 10, fees: 0, ...p });

describe('buildSeries (TWR)', () => {
  it('aportes não alteram a rentabilidade por cotas', () => {
    const prices = { AAAA11: hist('AAAA11', [['2024-01-02', 10], ['2024-01-03', 11], ['2024-01-04', 11], ['2024-01-05', 12.1]]) };
    const trades = [trade({ date: '2024-01-02', qty: 10, price: 10 }), trade({ date: '2024-01-04', qty: 100, price: 11 })];
    const s = buildSeries(trades, prices)!;
    expect(s.index[3]).toBeCloseTo(1.21, 10); // +10% e +10%
    expect(s.value[3]).toBeCloseTo(110 * 12.1, 6);
    expect(s.invested[3]).toBeCloseTo(100 + 1100, 6);
  });

  it('pondera os ativos pelo valor no fechamento anterior', () => {
    const prices = {
      AAAA11: hist('AAAA11', [['2024-01-02', 10], ['2024-01-03', 11]]),
      BBBB11: hist('BBBB11', [['2024-01-02', 10], ['2024-01-03', 10]]),
    };
    const trades = [trade({ qty: 70 }), trade({ ticker: 'BBBB11', qty: 30 })];
    const s = buildSeries(trades, prices)!;
    expect(s.index[1]).toBeCloseTo(1 + 0.7 * 0.1, 10);
  });

  it('usa o preço ajustado (proventos) no retorno e o fechamento no patrimônio', () => {
    const prices = { AAAA11: hist('AAAA11', [['2024-01-02', 10, 9], ['2024-01-03', 10, 9.9]]) };
    const s = buildSeries([trade({})], prices)!;
    expect(s.index[1]).toBeCloseTo(1.1, 10);
    expect(s.value[1]).toBeCloseTo(100, 10);
  });

  it('venda reduz posição e aporte líquido; filtro por ativo', () => {
    const prices = {
      AAAA11: hist('AAAA11', [['2024-01-02', 10], ['2024-01-03', 20]]),
      BBBB11: hist('BBBB11', [['2024-01-02', 5], ['2024-01-03', 5]]),
    };
    const trades = [trade({}), trade({ side: 'sell', date: '2024-01-03', qty: 5, price: 20 }), trade({ ticker: 'BBBB11', qty: 2, price: 5 })];
    const s = buildSeries(trades, prices)!;
    expect(s.value[1]).toBeCloseTo(5 * 20 + 2 * 5, 10);
    expect(s.invested[1]).toBeCloseTo(100 - 100 + 10, 10);
    const only = buildSeries(trades, prices, 'AAAA11')!;
    expect(only.index[1]).toBeCloseTo(2, 10);
  });

  it('lançamento posterior à última cotação entra no último pregão', () => {
    const prices = { AAAA11: hist('AAAA11', [['2024-01-02', 10], ['2024-01-03', 10]]) };
    const s = buildSeries([trade({}), trade({ date: '2024-01-10', qty: 1 })], prices)!;
    expect(s.invested[1]).toBeCloseTo(110, 10);
  });
});

describe('posições', () => {
  it('preço médio inclui custos e venda realiza lucro', () => {
    const p = positions([trade({ qty: 10, price: 10, fees: 2 }), trade({ qty: 10, price: 12 }), trade({ side: 'sell', date: '2024-02-01', qty: 5, price: 15, fees: 1 })]).AAAA11;
    expect(p.qty).toBe(15);
    expect(p.avgPrice).toBeCloseTo(222 / 20, 10);
    expect(p.realized).toBeCloseTo(5 * (15 - 11.1) - 1, 10);
    expect(qtyAt([trade({}), trade({ side: 'sell', date: '2024-03-01', qty: 4 })], 'AAAA11', '2024-02-01')).toBe(10);
  });
});

describe('benchmarks', () => {
  it('CDI acumula a partir do dia seguinte ao início', () => {
    const f = cdiFactors(['2024-01-02', '2024-01-03', '2024-01-05'], [
      { date: '2024-01-02', rate: 0.01 }, { date: '2024-01-03', rate: 0.01 }, { date: '2024-01-04', rate: 0.01 }, { date: '2024-01-05', rate: 0.01 },
    ]);
    expect(f[0]).toBe(1);
    expect(f[1]).toBeCloseTo(1.01, 10);
    expect(f[2]).toBeCloseTo(1.01 ** 3, 10);
  });

  it('IPCA é proporcional aos dias do mês e fica estável sem divulgação', () => {
    const f = ipcaFactors(['2024-01-31', '2024-02-29', '2024-03-15'], [{ month: '2024-01', rate: 0.01 }, { month: '2024-02', rate: 0.02 }]);
    expect(f[1] / f[0]).toBeCloseTo(1.02, 10);
    expect(f[2]).toBeCloseTo(f[1], 10);
  });
});

describe('indicadores', () => {
  it('drawdown máximo com topo, fundo e recuperação', () => {
    const d = maxDrawdown(['a', 'b', 'c', 'd', 'e'], [1, 1.2, 0.9, 1.1, 1.3]);
    expect(d.value).toBeCloseTo(-0.25, 10);
    expect(d).toMatchObject({ peak: 'b', trough: 'c', recovered: 'e' });
  });

  it('anualização e janelas', () => {
    expect(annualize(0.21, 730)).toBeCloseTo(0.1, 3);
    expect(isAnnualized(true, 730)).toBe(true);
    expect(isAnnualized(true, 365)).toBe(false);
    expect(isAnnualized(false, 730)).toBe(false);
    const dates = ['2023-12-29', '2024-06-28', '2024-12-30', '2025-06-30', '2025-12-30'];
    expect(windowFor(dates, '12M').start).toBe('2024-12-30');
    expect(windowFor(dates, 'YTD').start).toBe('2024-12-30');
    expect(windowFor(dates, '24M')).toMatchObject({ start: '2023-12-29', truncated: false });
    expect(windowFor(dates.slice(1), '24M')).toMatchObject({ start: '2024-06-28', truncated: true });
  });

  it('ganho real só para 12M ou mais; retornos mensais e tabela anual', () => {
    const dates: string[] = [];
    const index: number[] = [];
    for (let m = 0; m < 25; m++) {
      const d = new Date(2024, m, 28);
      dates.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-28`);
      index.push(1.01 ** m);
    }
    const series = { dates, index, value: index, invested: index.map(() => 1) };
    const b = bench(series, [], [{ month: '2024-02', rate: 0.005 }]);
    expect(stats(series, b, '6M').realAnnual).toBeNull();
    expect(stats(series, b, '12M').realAnnual).not.toBeNull();
    expect(stats(series, b, '12M').cdi).toBeNull();
    const mr = monthlyReturns(dates, index, 0, 24);
    expect(mr).toHaveLength(24);
    expect(mr[5].r).toBeCloseTo(0.01, 10);
    const years = yearTable(series, b);
    expect(years.map((y) => y.year)).toEqual(['2024', '2025', '2026']);
    expect(years[1].total).toBeCloseTo(1.01 ** 12 - 1, 10);
  });

  it('escala do eixo cobre os valores', () => {
    const a = niceAxis(-0.03, 0.58);
    expect(a.lo).toBeLessThanOrEqual(-0.03);
    expect(a.hi).toBeGreaterThanOrEqual(0.58);
    expect(a.ticks).toContain(0);
  });
});

describe('formatação', () => {
  it('percentual e números em pt-BR', () => {
    expect(pct(0.1234)).toBe('+12,34%');
    expect(pct(-0.05, 1)).toBe('−5,0%');
    expect(pct(0)).toBe('0,00%');
    expect(pct(null)).toBe('—');
    expect(parseNumberBR('1.234,56')).toBe(1234.56);
    expect(parseNumberBR('171.25')).toBe(171.25);
    expect(parseNumberBR('R$ 10,5')).toBe(10.5);
    expect(Number.isNaN(parseNumberBR('abc'))).toBe(true);
  });
});
