import { addMonths, daysBetween, daysInMonth } from './dates';
import type { MonthRate, Period, PriceHistory, RatePoint, Trade } from './types';

export const PERIODS: { id: Period; label: string }[] = [
  { id: '1M', label: '1M' },
  { id: '6M', label: '6M' },
  { id: '12M', label: '12M' },
  { id: '24M', label: '24M' },
  { id: 'YTD', label: 'Ano' },
  { id: 'MAX', label: 'Máx' },
];

/** Série diária de uma carteira (ou de um ativo isolado). */
export interface Series {
  dates: string[];
  /** índice de rentabilidade por cotas (TWR), começa em 1 */
  index: number[];
  /** patrimônio no fechamento */
  value: number[];
  /** aportes líquidos acumulados (compras − vendas) */
  invested: number[];
}

const byDate = (a: Trade, b: Trade) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0);

/**
 * Monta a série diária a partir dos lançamentos e do histórico de preços.
 * Rentabilidade por cotas: o retorno de cada pregão é a média dos retornos (ajustados por
 * proventos) dos ativos, ponderada pelo valor de cada posição no fechamento anterior,
 * então aportes e resgates não distorcem o resultado.
 */
export function buildSeries(trades: Trade[], prices: Record<string, PriceHistory>, only?: string): Series | null {
  const ts = trades.filter((t) => !only || t.ticker === only).sort(byDate);
  if (!ts.length) return null;
  const tickers = [...new Set(ts.map((t) => t.ticker))].filter((t) => prices[t]?.points.length);
  if (!tickers.length) return null;

  const first = ts[0].date;
  const dateSet = new Set<string>();
  for (const t of tickers) for (const p of prices[t].points) if (p.date >= first) dateSet.add(p.date);
  const dates = [...dateSet].sort();
  if (!dates.length) return null;

  const maps = tickers.map((t) => new Map(prices[t].points.map((p) => [p.date, p])));
  // preço anterior à primeira data, para o primeiro pregão já ter base
  const before = tickers.map((t) => {
    const pts = prices[t].points;
    let last: (typeof pts)[number] | undefined;
    for (const p of pts) if (p.date < dates[0]) last = p;
    return last;
  });
  let prevClose = before.map((p) => p?.close);
  let prevAdj = before.map((p) => p?.adj);

  const q = new Map<string, number>();
  const out: Series = { dates, index: [], value: [], invested: [] };
  let idx = 1;
  let inv = 0;
  let ti = 0;

  for (let d = 0; d < dates.length; d++) {
    const date = dates[d];
    const isLast = d === dates.length - 1;
    // lançamentos até esta data (no último pregão, também os posteriores à última cotação)
    while (ti < ts.length && (ts[ti].date <= date || isLast)) {
      const t = ts[ti++];
      const cur = q.get(t.ticker) ?? 0;
      if (t.side === 'buy') {
        q.set(t.ticker, cur + t.qty);
        inv += t.qty * t.price + t.fees;
      } else {
        q.set(t.ticker, Math.max(0, cur - t.qty));
        inv -= t.qty * t.price - t.fees;
      }
    }
    const close = tickers.map((_, k) => maps[k].get(date)?.close ?? prevClose[k]);
    const adj = tickers.map((_, k) => maps[k].get(date)?.adj ?? prevAdj[k]);

    let base = 0;
    let gain = 0;
    let value = 0;
    tickers.forEach((t, k) => {
      const n = q.get(t) ?? 0;
      if (n <= 0) return;
      const pc = prevClose[k];
      const pa = prevAdj[k];
      const a = adj[k];
      if (pc != null && pa != null && a != null && pa > 0) {
        base += n * pc;
        gain += n * pc * (a / pa - 1);
      }
      value += n * (close[k] ?? 0);
    });
    if (base > 0) idx *= 1 + gain / base;

    out.index.push(idx);
    out.value.push(value);
    out.invested.push(inv);
    prevClose = close;
    prevAdj = adj;
  }
  return out;
}

export interface Position {
  ticker: string;
  qty: number;
  /** preço médio (inclui custos de compra) */
  avgPrice: number;
  /** lucro já realizado em vendas */
  realized: number;
  bought: number;
  sold: number;
}

/** Posições atuais pelo método do preço médio. */
export function positions(trades: Trade[]): Record<string, Position> {
  const out: Record<string, Position> = {};
  for (const t of [...trades].sort(byDate)) {
    const p = (out[t.ticker] ??= { ticker: t.ticker, qty: 0, avgPrice: 0, realized: 0, bought: 0, sold: 0 });
    if (t.side === 'buy') {
      const cost = p.qty * p.avgPrice + t.qty * t.price + t.fees;
      p.qty += t.qty;
      p.avgPrice = p.qty > 0 ? cost / p.qty : 0;
      p.bought += t.qty * t.price + t.fees;
    } else {
      const n = Math.min(t.qty, p.qty);
      p.realized += n * (t.price - p.avgPrice) - t.fees;
      p.qty -= n;
      p.sold += t.qty * t.price - t.fees;
      if (p.qty === 0) p.avgPrice = 0;
    }
  }
  return out;
}

/** Quantidade de um ativo em uma data (para validar vendas). */
export function qtyAt(trades: Trade[], ticker: string, date: string): number {
  let n = 0;
  for (const t of trades) if (t.ticker === ticker && t.date <= date) n += t.side === 'buy' ? t.qty : -t.qty;
  return n;
}

/** Fator acumulado do CDI em cada data (inclui a taxa do próprio dia). */
export function cdiFactors(dates: string[], cdi: RatePoint[]): number[] {
  const out: number[] = [];
  let f = 1;
  let j = 0;
  // começa a acumular a partir da primeira data da série
  while (j < cdi.length && cdi[j].date <= (dates[0] ?? '')) j++;
  for (const d of dates) {
    while (j < cdi.length && cdi[j].date <= d) f *= 1 + cdi[j++].rate;
    out.push(f);
  }
  return out;
}

/**
 * Fator acumulado do IPCA em cada data. Dentro do mês a inflação é distribuída
 * proporcionalmente aos dias corridos; meses ainda não divulgados ficam estáveis.
 */
export function ipcaFactors(dates: string[], ipca: MonthRate[]): number[] {
  if (!dates.length) return [];
  const rate = new Map(ipca.map((m) => [m.month, m.rate]));
  const startOf = new Map<string, number>();
  let f = 1;
  let y = Number(dates[0].slice(0, 4));
  let m = Number(dates[0].slice(5, 7));
  const end = dates[dates.length - 1].slice(0, 7);
  for (;;) {
    const key = `${y}-${String(m).padStart(2, '0')}`;
    startOf.set(key, f);
    if (key >= end) break;
    f *= 1 + (rate.get(key) ?? 0);
    m++;
    if (m > 12) { m = 1; y++; }
  }
  const raw = dates.map((d) => {
    const key = d.slice(0, 7);
    const r = rate.get(key) ?? 0;
    const frac = Number(d.slice(8, 10)) / daysInMonth(Number(d.slice(0, 4)), Number(d.slice(5, 7)));
    return (startOf.get(key) ?? 1) * Math.pow(1 + r, frac);
  });
  return raw;
}

export const annualize = (r: number, days: number) => (days > 0 ? Math.pow(1 + r, 365 / days) - 1 : r);

export interface Drawdown {
  value: number;
  peak: string | null;
  trough: string | null;
  recovered: string | null;
}

export function maxDrawdown(dates: string[], index: number[]): Drawdown {
  let peak = -Infinity;
  let peakAt = 0;
  let best: Drawdown = { value: 0, peak: null, trough: null, recovered: null };
  let bestPeakVal = 0;
  for (let i = 0; i < index.length; i++) {
    if (index[i] > peak) { peak = index[i]; peakAt = i; }
    const dd = index[i] / peak - 1;
    if (dd < best.value) {
      best = { value: dd, peak: dates[peakAt], trough: dates[i], recovered: null };
      bestPeakVal = peak;
    }
  }
  if (best.trough) {
    const from = dates.indexOf(best.trough);
    for (let i = from + 1; i < index.length; i++) if (index[i] >= bestPeakVal) { best.recovered = dates[i]; break; }
  }
  return best;
}

/** desvio-padrão dos retornos diários, anualizado (252 pregões) */
export function volatility(index: number[]): number | null {
  if (index.length < 3) return null;
  const r: number[] = [];
  for (let i = 1; i < index.length; i++) r.push(index[i] / index[i - 1] - 1);
  const avg = r.reduce((a, b) => a + b, 0) / r.length;
  const v = r.reduce((a, b) => a + (b - avg) ** 2, 0) / (r.length - 1);
  return Math.sqrt(v) * Math.sqrt(252);
}

/** índices do último pregão de cada mês */
export function monthEnds(dates: string[]): number[] {
  const out: number[] = [];
  for (let i = 0; i < dates.length; i++) if (i === dates.length - 1 || dates[i + 1].slice(0, 7) !== dates[i].slice(0, 7)) out.push(i);
  return out;
}

export interface Window {
  i0: number;
  i1: number;
  start: string;
  end: string;
  days: number;
  /** o histórico é mais curto que o período pedido */
  truncated: boolean;
}

export function windowFor(dates: string[], period: Period): Window {
  const i1 = dates.length - 1;
  const end = dates[i1];
  let start: string;
  switch (period) {
    case '1M': start = addMonths(end, -1); break;
    case '6M': start = addMonths(end, -6); break;
    case '12M': start = addMonths(end, -12); break;
    case '24M': start = addMonths(end, -24); break;
    case 'YTD': start = `${Number(end.slice(0, 4)) - 1}-12-31`; break;
    default: start = dates[0];
  }
  let i0 = 0;
  for (let i = 0; i <= i1; i++) if (dates[i] <= start) i0 = i;
  return { i0, i1, start: dates[i0], end, days: daysBetween(dates[i0], end), truncated: dates[0] > start };
}

export interface MonthReturn {
  month: string;
  r: number;
}

/** retornos mensais dentro da janela (o primeiro mês parte do início da janela) */
export function monthlyReturns(dates: string[], index: number[], i0: number, i1: number): MonthReturn[] {
  const ends = monthEnds(dates).filter((i) => i > i0 && i <= i1);
  if (!ends.length || ends[ends.length - 1] !== i1) ends.push(i1);
  const out: MonthReturn[] = [];
  let prev = i0;
  for (const e of ends) {
    if (e === prev) continue;
    out.push({ month: dates[e].slice(0, 7), r: index[e] / index[prev] - 1 });
    prev = e;
  }
  return out;
}

export interface Bench {
  cdi: number[];
  ipca: number[];
  hasCdi: boolean;
  hasIpca: boolean;
}

export function bench(series: Series, cdi: RatePoint[], ipca: MonthRate[]): Bench {
  return {
    cdi: cdiFactors(series.dates, cdi),
    ipca: ipcaFactors(series.dates, ipca),
    hasCdi: cdi.length > 0,
    hasIpca: ipca.length > 0,
  };
}

export interface Stats extends Window {
  period: Period;
  ret: number;
  cdi: number | null;
  ipca: number | null;
  /** rentabilidade ÷ CDI, acumulados no período */
  pctCdi: number | null;
  /** ganho real ao ano; só para períodos de 12 meses ou mais */
  realAnnual: number | null;
  drawdown: Drawdown;
  vol: number | null;
  sharpe: number | null;
  months: MonthReturn[];
  best: MonthReturn | null;
  worst: MonthReturn | null;
  positive: number;
}

export function stats(series: Series, b: Bench, period: Period): Stats {
  const w = windowFor(series.dates, period);
  const { i0, i1, days } = w;
  const idx = series.index.slice(i0, i1 + 1);
  const ret = series.index[i1] / series.index[i0] - 1;
  const cdi = b.hasCdi ? b.cdi[i1] / b.cdi[i0] - 1 : null;
  const ipca = b.hasIpca ? b.ipca[i1] / b.ipca[i0] - 1 : null;
  const vol = days >= 28 ? volatility(idx) : null;
  const longEnough = days >= 365;
  const months = monthlyReturns(series.dates, series.index, i0, i1);
  let best: MonthReturn | null = null;
  let worst: MonthReturn | null = null;
  for (const m of months) {
    if (!best || m.r > best.r) best = m;
    if (!worst || m.r < worst.r) worst = m;
  }
  return {
    ...w,
    period,
    ret,
    cdi,
    ipca,
    pctCdi: cdi != null && cdi > 0 ? ret / cdi : null,
    realAnnual: longEnough && ipca != null ? Math.pow((1 + ret) / (1 + ipca), 365 / days) - 1 : null,
    drawdown: maxDrawdown(series.dates.slice(i0, i1 + 1), idx),
    vol,
    sharpe: days >= 180 && vol && cdi != null ? (annualize(ret, days) - annualize(cdi, days)) / vol : null,
    months,
    best,
    worst,
    positive: months.filter((m) => m.r > 0).length,
  };
}

/** Período exibido ao ano? (ajuste ligado e janela acima de 12 meses) */
export const isAnnualized = (annualizeOn: boolean, days: number) => annualizeOn && days > 366;

export const shownReturn = (r: number | null, days: number, annualizeOn: boolean) =>
  r == null ? null : isAnnualized(annualizeOn, days) ? annualize(r, days) : r;

export interface YearRow {
  year: string;
  months: (number | null)[];
  total: number;
  cdi: number | null;
}

/** tabela de retornos mensais por ano (mês incompleto no início usa a data da 1ª compra) */
export function yearTable(series: Series, b: Bench): YearRow[] {
  const ends = monthEnds(series.dates);
  const rows = new Map<string, YearRow>();
  let prev = 0;
  for (const e of ends) {
    if (e === prev && e !== 0) continue;
    const ym = series.dates[e].slice(0, 7);
    const y = ym.slice(0, 4);
    const row = rows.get(y) ?? { year: y, months: Array(12).fill(null), total: 0, cdi: null };
    row.months[Number(ym.slice(5, 7)) - 1] = series.index[e] / series.index[prev] - 1;
    rows.set(y, row);
    prev = e;
  }
  for (const row of rows.values()) {
    const inYear = series.dates.map((d, i) => (d.startsWith(row.year) ? i : -1)).filter((i) => i >= 0);
    const last = inYear[inYear.length - 1];
    const firstIdx = inYear[0];
    const base = firstIdx > 0 ? firstIdx - 1 : 0;
    row.total = series.index[last] / series.index[base] - 1;
    row.cdi = b.hasCdi ? b.cdi[last] / b.cdi[base] - 1 : null;
  }
  return [...rows.values()].sort((a, c) => (a.year < c.year ? -1 : 1));
}

export interface MonthFlow {
  month: string;
  invested: number;
  value: number;
}

export function monthlyFlows(series: Series): MonthFlow[] {
  return monthEnds(series.dates).map((i) => ({
    month: series.dates[i].slice(0, 7),
    invested: series.invested[i],
    value: series.value[i],
  }));
}

export interface Axis {
  lo: number;
  hi: number;
  ticks: number[];
  step: number;
}

/**
 * Escala com marcações "redondas" (até ~5) dentro do intervalo dos dados, com uma
 * folga de 6%. Valores que começam em zero (patrimônio) não ganham escala negativa.
 */
export function niceAxis(mn: number, mx: number, steps = [0.0025, 0.005, 0.01, 0.02, 0.025, 0.05, 0.1, 0.2, 0.25, 0.5, 1, 2, 5]): Axis {
  if (mx - mn < 1e-9) { mx += steps[0]; mn -= steps[0]; }
  let step = steps[steps.length - 1];
  for (const s of steps) if ((mx - mn) / s <= 4) { step = s; break; }
  const pad = (mx - mn) * 0.06;
  const lo = mn >= 0 ? Math.max(0, mn - pad) : mn - pad;
  const hi = mx <= 0 ? Math.min(0, mx + pad) : mx + pad;
  const ticks: number[] = [];
  for (let k = Math.ceil(lo / step - 1e-9); k * step <= hi + 1e-9; k++) ticks.push(Math.round(k * step * 1e6) / 1e6);
  return { lo, hi, ticks, step };
}
