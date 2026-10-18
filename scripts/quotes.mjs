// Dados de mercado gratuitos e sem token, publicados como arquivos estáticos:
// - quotes/<TICKER>.json: cotações diárias da B3 pelo Yahoo Finance (que não libera
//   chamadas do navegador);
// - rates/cdi.json e rates/ipca.json: CDI diário (Ipeadata, série do Banco Central) e
//   IPCA mensal (IBGE), no lugar da API SGS do Banco Central, que anda instável.
// O CI gera os arquivos após o fechamento e o `npm run dev` serve sob demanda (ver vite.config.ts).
// data/history/<TICKER>.json ([["AAAA-MM-DD", fechamento], ...]) é um histórico oficial que tem
// prioridade sobre o Yahoo nas datas que cobre; o Yahoo completa só os pregões posteriores.
//
// Uso: node scripts/quotes.mjs [pasta public]   (padrão: public, lendo tickers.txt)
import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const YAHOO = 'https://query1.finance.yahoo.com/v8/finance/chart';
/** CDI diário em % a.d. (SGS 12 do Banco Central, replicada pelo Ipeadata) */
const IPEA_CDI = "https://www.ipeadata.gov.br/api/odata4/ValoresSerie(SERCODIGO='SGS366_CDI366')";
/** IPCA, variação mensal em % (SIDRA, tabela 1737, variável 63) */
const SIDRA_IPCA = 'https://apisidra.ibge.gov.br/values/t/1737/n1/all/v/63/p/all/h/n';
/** início das séries publicadas: cobre carteiras de até ~15 anos sem pesar no celular */
const RATES_FROM = '2010-01-01';
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

const HISTORY = new URL('../data/history/', import.meta.url);

/** histórico oficial salvo no repositório, ou null */
async function readHistory(ticker) {
  const file = new URL(`${ticker}.json`, HISTORY);
  try {
    await access(file);
  } catch {
    return null;
  }
  return JSON.parse(await readFile(file, 'utf8'));
}

/**
 * Junta o histórico oficial ([data, fechamento]) com o do Yahoo: até a última data do
 * histórico valem só os pontos dele; depois, os do Yahoo. O ajuste por proventos do Yahoo
 * (adj ÷ close) é reaproveitado na mesma data quando existe.
 */
export function mergeHistory(q, rows) {
  if (!rows?.length) return q;
  const sorted = [...rows].sort((a, b) => (a[0] < b[0] ? -1 : 1));
  const end = sorted[sorted.length - 1][0];
  const ratio = new Map(q.points.map((p) => [p.date, p.adj / p.close]));
  const points = [
    ...sorted.map(([date, close]) => ({ date, close: r4(close), adj: r4(close * (ratio.get(date) ?? 1)) })),
    ...q.points.filter((p) => p.date > end),
  ];
  const last = points[points.length - 1];
  const prev = points[points.length - 2];
  return { ...q, points, price: last.close, changePct: prev ? last.close / prev.close - 1 : null };
}

/** cotações do Yahoo com o histórico oficial do repositório, quando houver */
export async function fetchQuote(ticker) {
  const [q, rows] = await Promise.all([fetchYahoo(ticker), readHistory(ticker)]);
  return mergeHistory(q, rows);
}

async function getJson(url, label) {
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (fin-dash)', Accept: 'application/json' } });
  const body = await res.json().catch(() => null);
  if (!res.ok || !body) throw new Error(`erro ${res.status} no ${label}`);
  return body;
}

/** CDI diário: [{ date, rate }] com a taxa do dia em fração */
export async function fetchCdi() {
  const body = await getJson(IPEA_CDI, 'Ipeadata');
  const out = (body.value ?? [])
    .map((r) => ({ date: String(r.VALDATA).slice(0, 10), rate: r.VALVALOR / 100 }))
    .filter((r) => r.date >= RATES_FROM && Number.isFinite(r.rate))
    .sort((a, b) => (a.date < b.date ? -1 : 1));
  if (!out.length) throw new Error('Ipeadata sem dados do CDI');
  return out;
}

/** IPCA mensal: [{ month, rate }] com a variação do mês em fração */
export async function fetchIpca() {
  const body = await getJson(SIDRA_IPCA, 'IBGE');
  const out = body
    .map((r) => ({ month: `${String(r.D3C).slice(0, 4)}-${String(r.D3C).slice(4, 6)}`, rate: Number(r.V) / 100 }))
    // linhas sem valor vêm como "..." ou "-"
    .filter((r) => r.month >= RATES_FROM.slice(0, 7) && Number.isFinite(r.rate))
    .sort((a, b) => (a.month < b.month ? -1 : 1));
  if (!out.length) throw new Error('IBGE sem dados do IPCA');
  return out;
}

async function main() {
  const root = fileURLToPath(new URL('..', import.meta.url));
  const pub = process.argv[2] ?? `${root}public`;
  const out = `${pub}/quotes`;
  const tickers = (await readFile(`${root}tickers.txt`, 'utf8'))
    .split(/\r?\n/)
    .map((l) => l.replace(/#.*/, '').trim().toUpperCase())
    .filter(Boolean);
  await mkdir(out, { recursive: true });
  let ok = 0;
  for (const t of tickers) {
    try {
      const q = await fetchQuote(t);
      await writeFile(`${out}/${t}.json`, JSON.stringify(q));
      console.log(`${t}: ${q.points.length} pregões até ${q.points[q.points.length - 1].date}`);
      ok++;
    } catch (e) {
      console.error(`${t}: ${e.message}`);
    }
  }
  // índices são da carteira inteira: sem eles o deploy não sai e o site anterior continua no ar
  let ratesOk = true;
  await mkdir(`${pub}/rates`, { recursive: true });
  for (const [name, fn] of [['cdi', fetchCdi], ['ipca', fetchIpca]]) {
    try {
      const rows = await fn();
      await writeFile(`${pub}/rates/${name}.json`, JSON.stringify(rows));
      console.log(`${name.toUpperCase()}: ${rows.length} registros até ${Object.values(rows[rows.length - 1])[0]}`);
    } catch (e) {
      console.error(`${name.toUpperCase()}: ${e.message}`);
      ratesOk = false;
    }
  }
  if (!ok || !ratesOk) process.exit(1);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) await main();
