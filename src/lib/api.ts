import { brToISO, dateBR, daysBetween, toISO, todayISO } from './dates';

/** data do pregão: o carimbo da brapi cai sempre no próprio dia em UTC */
const utcDate = (sec: number) => new Date(sec * 1000).toISOString().slice(0, 10);
/** data de um instante no fuso da B3 */
const b3Date = (iso: string) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date(iso));
import type { MonthRate, PriceHistory, PricePoint, RatePoint } from './types';

const BRAPI = 'https://brapi.dev/api';
const SGS = 'https://api.bcb.gov.br/dados/serie';
/** séries do Banco Central: 12 = CDI diário (% a.d.), 433 = IPCA mensal (% a.m.) */
const SERIE_CDI = 12;
const SERIE_IPCA = 433;

function rangeFor(days: number): string {
  if (days <= 28) return '1mo';
  if (days <= 88) return '3mo';
  if (days <= 178) return '6mo';
  if (days <= 360) return '1y';
  if (days <= 725) return '2y';
  if (days <= 1820) return '5y';
  return 'max';
}

interface BrapiHist {
  date: number;
  close: number | null;
  adjustedClose?: number | null;
}

interface BrapiResult {
  symbol: string;
  longName?: string;
  shortName?: string;
  regularMarketPrice?: number;
  regularMarketChangePercent?: number;
  regularMarketTime?: string;
  historicalDataPrice?: BrapiHist[];
}

/** Cotação atual e histórico diário de um ticker da B3 (brapi.dev). */
export async function fetchQuote(ticker: string, from: string, token: string): Promise<PriceHistory> {
  const range = rangeFor(daysBetween(from, todayISO()) + 10);
  const get = async (rg: string) => {
    const params = new URLSearchParams({ range: rg, interval: '1d' });
    if (token) params.set('token', token);
    let res: Response;
    try {
      res = await fetch(`${BRAPI}/quote/${encodeURIComponent(ticker)}?${params}`);
    } catch {
      throw new Error(`${ticker}: sem conexão com a brapi`);
    }
    const body = (await res.json().catch(() => null)) as { results?: BrapiResult[]; message?: string } | null;
    return { res, body, r: body?.results?.[0] };
  };
  let { res, body, r } = await get(range);
  // plano gratuito pode recusar históricos longos: tenta 3 meses antes de desistir
  if ((!res.ok || !r) && res.status >= 400 && res.status < 500 && range !== '1mo' && range !== '3mo') {
    const retry = await get('3mo');
    if (retry.res.ok && retry.r) ({ res, body, r } = retry);
  }
  if (!res.ok || !r) throw new Error(`${ticker}: ${body?.message ?? `erro ${res.status} na brapi`}`);

  const byDate = new Map<string, PricePoint>();
  for (const p of r.historicalDataPrice ?? []) {
    if (!p || typeof p.close !== 'number' || p.close <= 0) continue;
    const adj = typeof p.adjustedClose === 'number' && p.adjustedClose > 0 ? p.adjustedClose : p.close;
    const date = utcDate(p.date);
    byDate.set(date, { date, close: p.close, adj });
  }
  const points = [...byDate.values()].sort((a, b) => (a.date < b.date ? -1 : 1));
  const last = points[points.length - 1];
  const price = typeof r.regularMarketPrice === 'number' && r.regularMarketPrice > 0 ? r.regularMarketPrice : last?.close;
  if (!price) throw new Error(`${ticker}: sem cotação disponível`);

  // pregão de hoje ainda não está no histórico: acrescenta a cotação atual
  const marketDate = r.regularMarketTime ? b3Date(r.regularMarketTime) : todayISO();
  if (last && marketDate > last.date) points.push({ date: marketDate, close: price, adj: last.adj * (price / last.close) });
  else if (!last) points.push({ date: marketDate, close: price, adj: price });

  return {
    ticker,
    name: r.longName ?? r.shortName,
    points,
    price,
    changePct: typeof r.regularMarketChangePercent === 'number' ? r.regularMarketChangePercent / 100 : null,
  };
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
