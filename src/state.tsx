import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { fetchCDI, fetchIPCA, fetchQuote } from './lib/api';
import { addMonths, todayISO } from './lib/dates';
import { demoCDI, demoIPCA, demoQuote } from './lib/demo';
import { cleanMarket } from './lib/quality';
import { cached, clearAll, loadSettings, loadTrades, newId, putCache, save, withDefaults } from './lib/storage';
import type { Market, PriceHistory, Settings, Trade } from './lib/types';

const QUOTE_TTL = 15 * 60 * 1000;
const RATES_TTL = 12 * 60 * 60 * 1000;

const EMPTY_MARKET: Market = { prices: {}, cdi: [], ipca: [], errors: [], issues: [], updatedAt: null };

interface Ctx {
  trades: Trade[];
  settings: Settings;
  market: Market;
  loading: boolean;
  addTrade: (t: Omit<Trade, 'id'>) => void;
  deleteTrade: (id: string) => void;
  updateSettings: (patch: Partial<Settings>) => void;
  refresh: () => void;
  replaceAll: (trades: Trade[], settings?: Partial<Settings>) => void;
  loadSample: () => Promise<void>;
  resetAll: () => void;
}

const AppCtx = createContext<Ctx | null>(null);

export const useApp = () => {
  const c = useContext(AppCtx);
  if (!c) throw new Error('useApp fora do AppProvider');
  return c;
};

/** valor em R$ já formatado, ou oculto quando o olho da tela inicial está fechado */
export const useMoney = () => {
  const { settings } = useApp();
  return (text: string) => (settings.hideValues ? 'R$ ••••••' : text);
};

async function loadQuote(ticker: string, from: string, settings: Settings, force: boolean): Promise<PriceHistory> {
  if (settings.demo) return demoQuote(ticker);
  // chave 'y:' (Yahoo) para não reaproveitar o histórico curto salvo da brapi
  const c = cached<PriceHistory>(`y:${ticker}`, from, QUOTE_TTL);
  if (c?.fresh && !force) return c.data;
  try {
    const data = await fetchQuote(ticker);
    putCache(`y:${ticker}`, from, data);
    return data;
  } catch (e) {
    if (c) return c.data; // usa a última cotação salva
    throw e;
  }
}

async function loadRates(from: string, settings: Settings, force: boolean, errors: string[]) {
  if (settings.demo) return { cdi: demoCDI(), ipca: demoIPCA() };
  const out = { cdi: [] as Market['cdi'], ipca: [] as Market['ipca'] };
  const get = async <T,>(key: string, fn: () => Promise<T>, label: string): Promise<T | null> => {
    const c = cached<T>(key, from, RATES_TTL);
    if (c?.fresh && !force) return c.data;
    try {
      const data = await fn();
      putCache(key, from, data);
      return data;
    } catch (e) {
      errors.push(`${label}: ${(e as Error).message}`);
      return c?.data ?? null;
    }
  };
  out.cdi = (await get('cdi', () => fetchCDI(from), 'CDI')) ?? [];
  out.ipca = (await get('ipca', () => fetchIPCA(addMonths(from, -1)), 'IPCA')) ?? [];
  return out;
}

async function loadMarket(trades: Trade[], settings: Settings, force: boolean): Promise<Market> {
  if (!trades.length) return EMPTY_MARKET;
  const from = trades.reduce((m, t) => (t.date < m ? t.date : m), todayISO());
  const tickers = [...new Set(trades.map((t) => t.ticker))];
  const errors: string[] = [];
  const results = await Promise.allSettled(tickers.map((t) => loadQuote(t, from, settings, force)));
  const prices: Record<string, PriceHistory> = {};
  results.forEach((r, i) => {
    if (r.status === 'fulfilled') prices[tickers[i]] = r.value;
    else errors.push((r.reason as Error).message);
  });
  const rates = await loadRates(from, settings, force, errors);
  return { prices, ...rates, errors, issues: [], updatedAt: new Date().toISOString() };
}

/** carteira exemplo: aporte de R$ 1.000 no 1º pregão de cada mês, 70% WRLD11 / 30% B5P211 */
function sampleTrades(w: PriceHistory, b: PriceHistory): Trade[] {
  const out: Trade[] = [];
  const bMap = new Map(b.points.map((p) => [p.date, p.close]));
  let month = '';
  for (const p of w.points) {
    if (p.date < '2024-01-01' || p.date.slice(0, 7) === month) continue;
    const bClose = bMap.get(p.date);
    if (!bClose) continue;
    month = p.date.slice(0, 7);
    const mk = (ticker: string, amount: number, price: number): Trade => ({
      id: newId(), ticker, side: 'buy', date: p.date, qty: Math.max(1, Math.round(amount / price)), price: Math.round(price * 100) / 100, fees: 0,
    });
    out.push(mk('WRLD11', 700, p.close), mk('B5P211', 300, bClose));
  }
  return out;
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [trades, setTrades] = useState<Trade[]>(loadTrades);
  const [settings, setSettings] = useState<Settings>(loadSettings);
  const [rawMarket, setMarket] = useState<Market>(EMPTY_MARKET);
  // cotações com os erros detectados já corrigidos (os preços dos lançamentos servem de âncora)
  const market = useMemo(() => cleanMarket(rawMarket, trades), [rawMarket, trades]);
  const [loading, setLoading] = useState(false);
  const run = useRef(0);

  useEffect(() => save('trades', trades), [trades]);
  useEffect(() => save('settings', settings), [settings]);

  const doLoad = useCallback(async (force: boolean) => {
    const id = ++run.current;
    setLoading(true);
    const m = await loadMarket(trades, settings, force);
    if (id === run.current) {
      setMarket(m);
      setLoading(false);
    }
  }, [trades, settings]);

  // recarrega quando mudam os ativos, a data mais antiga ou a fonte de dados
  const tickerKey = useMemo(() => {
    const from = trades.reduce((m, t) => (t.date < m ? t.date : m), '9999');
    return [...new Set(trades.map((t) => t.ticker))].sort().join(',') + '|' + from;
  }, [trades]);
  useEffect(() => {
    void doLoad(false);
  }, [tickerKey, settings.demo]);

  const value: Ctx = {
    trades,
    settings,
    market,
    loading,
    addTrade: (t) => setTrades((cur) => [...cur, { ...t, id: newId() }]),
    deleteTrade: (id) => setTrades((cur) => cur.filter((t) => t.id !== id)),
    updateSettings: (patch) => setSettings((cur) => ({ ...cur, ...patch })),
    refresh: () => void doLoad(true),
    replaceAll: (ts, s) => {
      setTrades(ts);
      if (s) setSettings((cur) => withDefaults({ ...cur, ...s }));
    },
    loadSample: async () => {
      const [w, b] = await Promise.all([
        loadQuote('WRLD11', '2024-01-01', settings, false),
        loadQuote('B5P211', '2024-01-01', settings, false),
      ]);
      setTrades(sampleTrades(w, b));
      setSettings((cur) => ({ ...cur, targets: { 'RV Internacional': 0.7, 'RF Brasil': 0.3 } }));
    },
    resetAll: () => {
      clearAll();
      setTrades([]);
      setSettings(loadSettings());
      setMarket(EMPTY_MARKET);
    },
  };

  return <AppCtx.Provider value={value}>{children}</AppCtx.Provider>;
}
