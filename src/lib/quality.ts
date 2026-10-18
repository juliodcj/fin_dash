import { dateBR, daysBetween, fromISO, toISO } from './dates';
import { brl } from './format';
import type { Market, PriceHistory, PricePoint, QuoteIssue, Trade } from './types';

/** pregões seguidos com o mesmo fechamento a partir dos quais a cotação é tida como parada */
const STALE_RUN = 5;
/** variação de um dia que, desfeita no pregão seguinte, indica cotação fora da curva */
const SPIKE = 0.15;
/** dias corridos sem cotação que já contam como lacuna */
const GAP_DAYS = 10;
/** variação de um dia que merece aviso mesmo sem se desfazer */
const JUMP = 0.25;

interface Anchor {
  date: string;
  close: number;
  adj: number;
}

/** dias úteis (seg–sex) estritamente entre a e b */
function weekdaysBetween(a: string, b: string): string[] {
  const out: string[] = [];
  const d = fromISO(a);
  for (d.setDate(d.getDate() + 1); toISO(d) < b; d.setDate(d.getDate() + 1)) {
    if (d.getDay() !== 0 && d.getDay() !== 6) out.push(toISO(d));
  }
  return out;
}

/**
 * Procura erros no histórico de cotações e devolve uma cópia corrigida:
 * - cotação parada (o mesmo fechamento por STALE_RUN pregões ou mais);
 * - pontos fora da curva (salto que se desfaz no pregão seguinte);
 * - lacunas de mais de GAP_DAYS dias sem cotação.
 * Os trechos ruins são estimados por interpolação geométrica entre as cotações válidas
 * vizinhas e os preços dos lançamentos do próprio ativo nesse intervalo. Os pontos
 * estimados vêm com `est: true`.
 */
export function checkQuotes(h: PriceHistory, trades: Trade[] = []): { history: PriceHistory; issues: QuoteIssue[] } {
  const pts = h.points;
  const issues: QuoteIssue[] = [];
  if (pts.length < 3) return { history: h, issues };
  const bad = pts.map(() => false);
  const last = pts.length - 1;

  // cotação parada: mantém o 1º ponto da sequência, que pode ser real — a não ser que o
  // mesmo valor já tenha ficado parado antes (a fonte voltou a repetir um valor congelado)
  const frozen = new Set<number>();
  for (let s = 0, i = 1; i <= pts.length; i++) {
    if (i <= last && pts[i].close === pts[s].close) continue;
    const e = i - 1;
    if (e - s + 1 >= STALE_RUN) {
      // parada até o último pregão: sem cotação posterior para estimar, só avisa
      const tail = e === last;
      if (!tail) for (let k = frozen.has(pts[s].close) && s > 0 ? s : s + 1; k <= e; k++) bad[k] = true;
      frozen.add(pts[s].close);
      issues.push({
        ticker: h.ticker, kind: 'stale', from: pts[s].date, to: pts[e].date, fixed: !tail,
        text: `cotação parada em ${brl(pts[s].close)} de ${dateBR(pts[s].date)} a ${dateBR(pts[e].date)}`,
      });
    }
    s = i;
  }

  // fora da curva: compara com as cotações válidas vizinhas
  const good = () => pts.map((_, i) => i).filter((i) => !bad[i]);
  let g = good();
  for (let n = 1; n < g.length - 1; n++) {
    const [j, i, k] = [g[n - 1], g[n], g[n + 1]];
    const r1 = pts[i].close / pts[j].close - 1;
    const r2 = pts[k].close / pts[i].close - 1;
    if (Math.abs(r1) > SPIKE && Math.abs(r2) > SPIKE && Math.sign(r1) !== Math.sign(r2) && Math.abs(pts[k].close / pts[j].close - 1) < SPIKE / 2) {
      bad[i] = true;
      // o vizinho seguinte passa a ser comparado com j
      g.splice(n--, 1);
      issues.push({
        ticker: h.ticker, kind: 'spike', from: pts[i].date, to: pts[i].date, fixed: true,
        text: `cotação fora da curva em ${dateBR(pts[i].date)} (${brl(pts[i].close)})`,
      });
    }
  }
  g = good();

  // lacunas e saltos entre cotações válidas seguidas, sem nada ruim no meio
  for (let n = 1; n < g.length; n++) {
    const [a, b] = [pts[g[n - 1]], pts[g[n]]];
    if (g[n] - g[n - 1] > 1) continue;
    if (daysBetween(a.date, b.date) > GAP_DAYS) {
      issues.push({
        ticker: h.ticker, kind: 'gap', from: a.date, to: b.date, fixed: true,
        text: `sem cotações entre ${dateBR(a.date)} e ${dateBR(b.date)}`,
      });
    } else if (Math.abs(b.adj / a.adj - 1) > JUMP) {
      issues.push({
        ticker: h.ticker, kind: 'jump', from: a.date, to: b.date, fixed: false,
        text: `variação de ${Math.round((b.adj / a.adj - 1) * 100)}% em ${dateBR(b.date)}; confira se a cotação está certa`,
      });
    }
  }

  const needsFix = issues.some((x) => x.fixed);
  if (!needsFix) return { history: h, issues };

  // preço médio dos lançamentos por dia, para servir de âncora dentro dos trechos ruins
  const tradeAt = new Map<string, { v: number; q: number }>();
  for (const t of trades) {
    if (t.ticker !== h.ticker || !(t.price > 0) || !(t.qty > 0)) continue;
    const c = tradeAt.get(t.date) ?? { v: 0, q: 0 };
    c.v += t.price * t.qty;
    c.q += t.qty;
    tradeAt.set(t.date, c);
  }

  const out: PricePoint[] = [];
  for (let n = 0; n < g.length; n++) {
    const a = pts[g[n]];
    out.push(a);
    if (n === g.length - 1) break;
    const b = pts[g[n + 1]];
    const inner = pts.slice(g[n] + 1, g[n + 1]).map((p) => p.date);
    // completa lacunas sem linha nenhuma com os dias úteis
    const known = [a.date, ...inner, b.date];
    const dates: string[] = [];
    for (let k = 1; k < known.length; k++) {
      if (daysBetween(known[k - 1], known[k]) > GAP_DAYS) dates.push(...weekdaysBetween(known[k - 1], known[k]));
      if (k < known.length - 1) dates.push(known[k]);
    }
    if (!dates.length) continue;

    // âncoras: as duas cotações válidas e os lançamentos entre elas (com o ajuste por proventos de b)
    const ratio = b.adj / b.close;
    const anchors: Anchor[] = [a];
    for (const [date, c] of [...tradeAt].sort((x, y) => (x[0] < y[0] ? -1 : 1))) {
      if (date > a.date && date < b.date) anchors.push({ date, close: c.v / c.q, adj: (c.v / c.q) * ratio });
    }
    anchors.push(b);
    const all = [...new Set([...dates, ...anchors.slice(1, -1).map((x) => x.date)])].sort();
    let m = 0;
    for (const date of all) {
      while (anchors[m + 1].date < date) m++;
      const [p, q] = [anchors[m], anchors[m + 1]];
      const t = daysBetween(p.date, date) / daysBetween(p.date, q.date);
      out.push({
        date,
        close: p.close * Math.pow(q.close / p.close, t),
        adj: p.adj * Math.pow(q.adj / p.adj, t),
        est: true,
      });
    }
  }
  return { history: { ...h, points: out }, issues };
}

/** corrige as cotações de todos os ativos e junta os avisos que importam para a carteira */
export function cleanMarket(m: Market, trades: Trade[]): Market {
  const prices: Market['prices'] = {};
  const issues: QuoteIssue[] = [];
  for (const [t, h] of Object.entries(m.prices)) {
    const r = checkQuotes(h, trades);
    prices[t] = r.history;
    issues.push(...relevantIssues(r.issues, trades));
  }
  return { ...m, prices, issues };
}

/** avisos que importam: só os trechos depois da 1ª compra do ativo */
export function relevantIssues(issues: QuoteIssue[], trades: Trade[]): QuoteIssue[] {
  return issues.filter((x) => {
    const first = trades.filter((t) => t.ticker === x.ticker).reduce((m, t) => (t.date < m ? t.date : m), '9999');
    return x.to >= first;
  });
}

/** "B5P211: cotação parada em R$ 71,25 de … a … (estimada pelos preços vizinhos e dos lançamentos)" */
export const issueText = (x: QuoteIssue) =>
  `${x.ticker}: ${x.text}${x.fixed ? ' — trecho estimado entre as cotações válidas e os preços dos seus lançamentos' : ''}`;
