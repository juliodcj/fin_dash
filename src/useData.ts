import { useMemo } from 'react';
import { classOf, CLASSES } from './lib/assets';
import { bench, buildSeries, positions, type Bench, type Position, type Series } from './lib/finance';
import type { Settings } from './lib/types';
import { useApp } from './state';

export interface Holding extends Position {
  price: number;
  value: number;
  changePct: number | null;
  /** fração do patrimônio */
  weight: number;
  /** resultado da posição atual: cotação ÷ preço médio − 1 */
  result: number;
  name?: string;
}

export interface Subject {
  series: Series;
  bench: Bench;
}

/** Série + benchmarks da carteira inteira (ticker vazio) ou de um ativo. */
export function useSubject(ticker?: string): Subject | null {
  const { trades, market } = useApp();
  return useMemo(() => {
    const series = buildSeries(trades, market.prices, ticker);
    return series ? { series, bench: bench(series, market.cdi, market.ipca) } : null;
  }, [trades, market, ticker]);
}

export function usePortfolio() {
  const { trades, market } = useApp();
  return useMemo(() => {
    const pos = positions(trades);
    const list: Holding[] = [];
    for (const p of Object.values(pos)) {
      if (p.qty <= 0) continue;
      const h = market.prices[p.ticker];
      const price = h?.price ?? p.avgPrice;
      list.push({
        ...p,
        price,
        value: p.qty * price,
        changePct: h?.changePct ?? null,
        weight: 0,
        result: p.avgPrice > 0 ? price / p.avgPrice - 1 : 0,
        name: h?.name,
      });
    }
    const total = list.reduce((a, h) => a + h.value, 0);
    for (const h of list) h.weight = total > 0 ? h.value / total : 0;
    list.sort((a, b) => b.value - a.value);
    const today = list.reduce((a, h) => a + (h.changePct != null ? (h.value * h.changePct) / (1 + h.changePct) : 0), 0);
    const invested = trades.reduce((a, t) => a + (t.side === 'buy' ? t.qty * t.price + t.fees : -(t.qty * t.price - t.fees)), 0);
    // rendimento por ativo = valor atual + vendas − compras
    const income = Object.values(pos).map((p) => ({
      ticker: p.ticker,
      value: p.qty * (market.prices[p.ticker]?.price ?? p.avgPrice) + p.sold - p.bought,
    }));
    return {
      holdings: list,
      positions: pos,
      total,
      today,
      todayPct: total - today > 0 ? today / (total - today) : 0,
      invested,
      profit: total - invested,
      income,
    };
  }, [trades, market]);
}

/** cor fixa por ativo, na ordem em que aparecem na carteira */
const PALETTE = ['#1F4FD1', '#7FA6F0', '#0F766E', '#D97706', '#7C3AED', '#DB2777', '#475569', '#65A30D'];
export const colorFor = (ticker: string, all: string[]) => PALETTE[Math.max(0, all.indexOf(ticker)) % PALETTE.length];

export interface ClassAlloc {
  name: string;
  value: number;
  /** fração do patrimônio */
  weight: number;
  /** meta em fração, se houver */
  target: number | null;
  tickers: string[];
}

/** alocação por classe de ativo (as classes com meta aparecem mesmo zeradas), na ordem de CLASSES */
export function classAlloc(holdings: Holding[], settings: Settings): ClassAlloc[] {
  const map = new Map<string, ClassAlloc>();
  const get = (name: string) => {
    if (!map.has(name)) map.set(name, { name, value: 0, weight: 0, target: settings.targets[name] ?? null, tickers: [] });
    return map.get(name)!;
  };
  for (const h of holdings) {
    const c = get(classOf(h.ticker, settings.classes, h.name));
    c.value += h.value;
    c.weight += h.weight;
    c.tickers.push(h.ticker);
  }
  for (const name of Object.keys(settings.targets)) get(name);
  const order = (n: string) => { const i = (CLASSES as readonly string[]).indexOf(n); return i < 0 ? 99 : i; };
  return [...map.values()].sort((a, b) => b.value - a.value || order(a.name) - order(b.name));
}

const CLASS_PALETTE: Record<string, string> = {
  'RF Brasil': '#7FA6F0',
  'RV Brasil': '#0F766E',
  'RF Internacional': '#D97706',
  'RV Internacional': '#1F4FD1',
  FIIs: '#7C3AED',
  Cripto: '#DB2777',
  Outros: '#475569',
};
export const classColor = (name: string) => CLASS_PALETTE[name] ?? '#475569';
