// Cotações diárias da B3 pelo Yahoo Finance (gratuito, sem token).
// O Yahoo não libera chamadas do navegador (CORS), então as cotações viram arquivos
// estáticos em quotes/<TICKER>.json: o CI gera após o fechamento e o `npm run dev`
// serve sob demanda (ver vite.config.ts).
//
// Uso: node scripts/quotes.mjs [pasta de saída]   (padrão: public/quotes, lendo tickers.txt)
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const YAHOO = 'https://query1.finance.yahoo.com/v8/finance/chart';
const r4 = (n) => Math.round(n * 10000) / 10000;

/** histórico diário de um ticker da B3 no formato PriceHistory do app */
export async function fetchYahoo(ticker) {
  const url = `${YAHOO}/${encodeURIComponent(ticker)}.SA?range=10y&interval=1d&events=div,split`;
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (fin-dash)' } });
  const body = await res.json().catch(() => null);
  const r = body?.chart?.result?.[0];
  if (!res.ok || !r) throw new Error(body?.chart?.error?.description ?? `erro ${res.status} no Yahoo`);

  const close = r.indicators?.quote?.[0]?.close ?? [];
  const adjc = r.indicators?.adjclose?.[0]?.adjclose ?? [];
  const offset = r.meta?.gmtoffset ?? -10800;
  const byDate = new Map();
  (r.timestamp ?? []).forEach((ts, i) => {
    const c = close[i];
    if (typeof c !== 'number' || c <= 0) return;
    const a = typeof adjc[i] === 'number' && adjc[i] > 0 ? adjc[i] : c;
    // carimbo em UTC; o dia do pregão é o do fuso da bolsa
    const date = new Date((ts + offset) * 1000).toISOString().slice(0, 10);
    byDate.set(date, { date, close: r4(c), adj: r4(a) });
  });
  const points = [...byDate.values()].sort((a, b) => (a.date < b.date ? -1 : 1));
  const last = points[points.length - 1];
  if (!last) throw new Error('sem cotação disponível');
  const prev = points[points.length - 2];
  return {
    ticker,
    name: r.meta?.longName ?? r.meta?.shortName,
    points,
    price: last.close,
    changePct: prev ? last.close / prev.close - 1 : null,
  };
}

async function main() {
  const root = fileURLToPath(new URL('..', import.meta.url));
  const out = process.argv[2] ?? `${root}public/quotes`;
  const tickers = (await readFile(`${root}tickers.txt`, 'utf8'))
    .split(/\r?\n/)
    .map((l) => l.replace(/#.*/, '').trim().toUpperCase())
    .filter(Boolean);
  await mkdir(out, { recursive: true });
  let ok = 0;
  for (const t of tickers) {
    try {
      const q = await fetchYahoo(t);
      await writeFile(`${out}/${t}.json`, JSON.stringify(q));
      console.log(`${t}: ${q.points.length} pregões até ${q.points[q.points.length - 1].date}`);
      ok++;
    } catch (e) {
      console.error(`${t}: ${e.message}`);
    }
  }
  if (!ok) process.exit(1);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) await main();
