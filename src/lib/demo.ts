// Dados simulados para o modo demonstração (sem internet ou sem token da brapi).
import { daysInMonth, toISO, todayISO } from './dates';
import type { MonthRate, PriceHistory, RatePoint } from './types';

const START = '2024-01-01';

// retornos mensais ilustrativos (%), jan/24 em diante; repetem em ciclo depois do fim
const MONTHLY: Record<string, { base: number; noise: number; m: number[] }> = {
  WRLD11: {
    base: 100,
    noise: 0.009,
    m: [1.82, 4.5, 1.93, 1.62, -0.52, 1.97, 6.59, 4.19, 6.32, 3.58, 4.09, 3.36, -4.57, 5.67, 4.26, 4.23, -4.67, -4.89, -1.41, 0.3, 3.44, 2.01, 4.32, -0.41, 1.31, 1.56, -1.59, 5.51, 2.05, 3.96, -1.47, -1.82, -0.64, 0.07],
  },
  B5P211: {
    base: 95,
    noise: 0.0018,
    m: [0.99, 0.69, 0.13, -0.28, 0.07, 1.46, -0.16, 0.68, 0.83, -0.7, 0.53, 1.53, -0.3, 0.71, 0.84, 0.42, 1.21, 0.87, 0.03, 1.4, 1.31, 1.48, 1.77, 1.12, 1.01, 0.3, 1.26, 0.64, 0.72, 0.31, 0.46, 0.68, 1.59, -0.07],
  },
};
const CDI_M = [0.8, 0.89, 0.94, 0.91, 0.78, 0.76, 0.89, 0.84, 0.82, 0.92, 0.94, 0.88, 1.01, 0.99, 0.96, 1.06, 1.14, 1.1, 1.28, 1.16, 1.22, 1.28, 1.05, 1.22, 1.16, 1.0, 1.15, 1.1, 1.14, 1.14, 1.27, 1.13, 1.08, 1.13];
const IPCA_M = [0.42, 0.83, 0.16, 0.38, 0.46, 0.21, 0.38, -0.02, 0.44, 0.56, 0.39, 0.52, 0.16, 1.31, 0.56, 0.43, 0.26, 0.24, 0.26, -0.11, 0.48, 0.09, 0.18, 0.33, 0.33, 0.51, 0.45, 0.38, 0.3, 0.22, 0.28, 0.12, 0.35, 0.3];

function rng(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const hash = (s: string) => [...s].reduce((h, c) => (Math.imul(h, 31) + c.charCodeAt(0)) | 0, 7);
const at = (arr: number[], i: number) => arr[((i % arr.length) + arr.length) % arr.length] / 100;

/** dias úteis (seg–sex) agrupados por mês, de jan/24 até hoje */
function businessMonths(): { key: string; i: number; days: string[] }[] {
  const out: { key: string; i: number; days: string[] }[] = [];
  const end = todayISO();
  for (let y = 2024, m = 1, i = 0; `${y}-${String(m).padStart(2, '0')}-01` <= end; i++) {
    const days: string[] = [];
    for (let d = 1; d <= daysInMonth(y, m); d++) {
      const date = new Date(y, m - 1, d);
      const iso = toISO(date);
      if (iso < START || iso > end) continue;
      if (date.getDay() !== 0 && date.getDay() !== 6) days.push(iso);
    }
    if (days.length) out.push({ key: `${y}-${String(m).padStart(2, '0')}`, i, days });
    m++;
    if (m > 12) { m = 1; y++; }
  }
  return out;
}

export function demoQuote(ticker: string): PriceHistory {
  const cfg = MONTHLY[ticker] ?? {
    base: 20 + (Math.abs(hash(ticker)) % 80),
    noise: 0.012,
    m: Array.from({ length: 24 }, (_, k) => 0.8 + 4 * Math.sin(k * 1.7 + hash(ticker))),
  };
  const rand = rng(hash(ticker));
  let price = cfg.base;
  const points = [];
  let lastRet = 0;
  for (const month of businessMonths()) {
    const n = month.days.length;
    const daily = Math.pow(1 + at(cfg.m, month.i), 1 / n) - 1;
    const noise = month.days.map(() => (rand() - 0.5) * 2 * cfg.noise * Math.sqrt(3));
    const mean = noise.reduce((a, b) => a + b, 0) / n;
    for (let k = 0; k < n; k++) {
      lastRet = daily + noise[k] - mean;
      price *= 1 + lastRet;
      const close = Math.round(price * 100) / 100;
      points.push({ date: month.days[k], close, adj: close });
    }
  }
  const last = points[points.length - 1];
  return { ticker, name: `${ticker} (demonstração)`, points, price: last.close, changePct: lastRet };
}

export function demoCDI(): RatePoint[] {
  const out: RatePoint[] = [];
  for (const month of businessMonths()) {
    const daily = Math.pow(1 + at(CDI_M, month.i), 1 / month.days.length) - 1;
    for (const d of month.days) out.push({ date: d, rate: daily });
  }
  return out;
}

export function demoIPCA(): MonthRate[] {
  // o mês corrente ainda não foi "divulgado"
  return businessMonths().slice(0, -1).map((m) => ({ month: m.key, rate: at(IPCA_M, m.i) }));
}
