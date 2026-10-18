import type { MonthRate, PriceHistory, RatePoint } from './types';

/** dados de mercado publicados como arquivos estáticos (scripts/quotes.mjs) */
const QUOTES = `${import.meta.env.BASE_URL}quotes`;
const RATES = `${import.meta.env.BASE_URL}rates`;

/** Histórico diário de um ticker da B3 até o último fechamento. */
export async function fetchQuote(ticker: string): Promise<PriceHistory> {
  let res: Response;
  try {
    res = await fetch(`${QUOTES}/${encodeURIComponent(ticker)}.json`, { cache: 'no-cache' });
  } catch {
    throw new Error(`${ticker}: sem conexão para buscar a cotação`);
  }
  const q = (await res.json().catch(() => null)) as (PriceHistory & { message?: string }) | null;
  // no dev o servidor repassa o erro do Yahoo; no site publicado só há os tickers de tickers.txt
  if (q?.message) throw new Error(`${ticker}: ${q.message}`);
  if (!res.ok || !q?.points?.length) throw new Error(`${ticker}: cotação não publicada (inclua o ticker em tickers.txt no repositório)`);
  return q;
}

async function fetchRates<T>(name: 'cdi' | 'ipca', label: string): Promise<T[]> {
  let res: Response;
  try {
    res = await fetch(`${RATES}/${name}.json`, { cache: 'no-cache' });
  } catch {
    throw new Error(`sem conexão para buscar o ${label}`);
  }
  const body = (await res.json().catch(() => null)) as T[] | { message?: string } | null;
  if (!Array.isArray(body)) throw new Error((body as { message?: string } | null)?.message ?? `${label} não publicado`);
  return body;
}

/** CDI diário (Ipeadata, série 12 do Banco Central) a partir de `from` */
export async function fetchCDI(from: string): Promise<RatePoint[]> {
  return (await fetchRates<RatePoint>('cdi', 'CDI')).filter((r) => r.date >= from);
}

/** IPCA mensal (IBGE) a partir do mês de `from` */
export async function fetchIPCA(from: string): Promise<MonthRate[]> {
  return (await fetchRates<MonthRate>('ipca', 'IPCA')).filter((r) => r.month >= from.slice(0, 7));
}
