import { brToISO, dateBR, toISO, todayISO } from './dates';
import type { MonthRate, PriceHistory, RatePoint } from './types';

/** cotações do Yahoo publicadas como arquivos estáticos (scripts/quotes.mjs) */
const QUOTES = `${import.meta.env.BASE_URL}quotes`;
const SGS = 'https://api.bcb.gov.br/dados/serie';
/** séries do Banco Central: 12 = CDI diário (% a.d.), 433 = IPCA mensal (% a.m.) */
const SERIE_CDI = 12;
const SERIE_IPCA = 433;

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

/** Série do SGS em janelas de até 9 anos (limite da API para séries diárias). */
async function sgs(serie: number, from: string, to: string): Promise<{ date: string; value: number }[]> {
  const out: { date: string; value: number }[] = [];
  let start = from;
  while (start <= to) {
    const y = Number(start.slice(0, 4)) + 9;
    const chunkEnd = `${y}${start.slice(4)}` < to ? `${y}${start.slice(4)}` : to;
    const url = `${SGS}/bcdata.sgs.${serie}/dados?formato=json&dataInicial=${dateBR(start)}&dataFinal=${dateBR(chunkEnd)}`;
    let res: Response;
    try {
      res = await fetch(url);
    } catch {
      throw new Error('sem conexão com o Banco Central');
    }
    // 404 = nenhum dado no intervalo (ex.: IPCA do mês corrente)
    if (res.status !== 404) {
      if (!res.ok) throw new Error(`Banco Central respondeu ${res.status}`);
      const rows = (await res.json()) as { data: string; valor: string }[];
      for (const row of rows) out.push({ date: brToISO(row.data), value: Number(row.valor) / 100 });
    }
    if (chunkEnd >= to) break;
    const next = new Date(Number(chunkEnd.slice(0, 4)), Number(chunkEnd.slice(5, 7)) - 1, Number(chunkEnd.slice(8, 10)) + 1);
    start = toISO(next);
  }
  return out;
}

export async function fetchCDI(from: string): Promise<RatePoint[]> {
  const rows = await sgs(SERIE_CDI, from, todayISO());
  return rows.map((r) => ({ date: r.date, rate: r.value }));
}

export async function fetchIPCA(from: string): Promise<MonthRate[]> {
  const rows = await sgs(SERIE_IPCA, `${from.slice(0, 7)}-01`, todayISO());
  return rows.map((r) => ({ month: r.date.slice(0, 7), rate: r.value }));
}
