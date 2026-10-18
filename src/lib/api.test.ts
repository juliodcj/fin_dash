import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchYahoo } from '../../scripts/quotes.mjs';
import { fetchCDI, fetchIPCA, fetchQuote } from './api';

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

afterEach(() => vi.unstubAllGlobals());

describe('Yahoo (scripts/quotes.mjs)', () => {
  it('converte o histórico no fuso da B3, usa o ajustado e ignora pregões vazios', async () => {
    const fetchMock = vi.fn(async (_url: string) =>
      json(200, {
        chart: {
          result: [{
            meta: { longName: 'Investo FTSE Global', gmtoffset: -10800 },
            // 13h UTC = 10h em Brasília; 2h UTC do dia 16 ainda é dia 15 em Brasília
            timestamp: [Date.UTC(2026, 9, 14, 13) / 1000, Date.UTC(2026, 9, 16, 2) / 1000, Date.UTC(2026, 9, 16, 13) / 1000, Date.UTC(2026, 9, 19, 13) / 1000],
            indicators: { quote: [{ close: [100, 105, null, 110] }], adjclose: [{ adjclose: [99, null, null, 110] }] },
          }],
        },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const q = await fetchYahoo('WRLD11');
    expect(String(fetchMock.mock.calls[0][0])).toContain('/chart/WRLD11.SA?range=10y&interval=1d');
    expect(q.points.map((p) => p.date)).toEqual(['2026-10-14', '2026-10-15', '2026-10-19']);
    expect(q.points[0].adj).toBe(99);
    expect(q.points[1].adj).toBe(105);
    expect(q.price).toBe(110);
    expect(q.changePct).toBeCloseTo(110 / 105 - 1, 10);
    expect(q.name).toBe('Investo FTSE Global');
  });

  it('mostra a mensagem do Yahoo quando o ticker não existe', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json(404, { chart: { result: null, error: { description: 'No data found, symbol may be delisted' } } })));
    await expect(fetchYahoo('XXXX11')).rejects.toThrow('No data found');
  });
});

describe('cotações publicadas', () => {
  it('lê quotes/<TICKER>.json do próprio site', async () => {
    const q = { ticker: 'B5P211', points: [{ date: '2026-10-16', close: 120, adj: 120 }], price: 120, changePct: null };
    const fetchMock = vi.fn(async (_url: string) => json(200, q));
    vi.stubGlobal('fetch', fetchMock);
    expect(await fetchQuote('B5P211')).toEqual(q);
    expect(String(fetchMock.mock.calls[0][0])).toMatch(/quotes\/B5P211\.json$/);
  });

  it('explica como incluir um ticker que não foi publicado', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('<html>404</html>', { status: 404 })));
    await expect(fetchQuote('PETR4')).rejects.toThrow('PETR4: cotação não publicada (inclua o ticker em tickers.txt');
  });
});

describe('Banco Central (SGS)', () => {
  it('lê CDI diário e IPCA mensal em fração; 404 = sem dados', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes('sgs.12/')) return json(200, [{ data: '01/10/2026', valor: '0.055131' }, { data: '02/10/2026', valor: '0.055131' }]);
      if (url.includes('dataInicial=01/08/2026')) return json(200, [{ data: '01/08/2026', valor: '0.35' }]);
      return json(404, { error: 'Value(s) not found' });
    });
    vi.stubGlobal('fetch', fetchMock);
    const cdi = await fetchCDI('2026-10-01');
    expect(cdi.map((c) => c.date)).toEqual(['2026-10-01', '2026-10-02']);
    expect(cdi[0].rate).toBeCloseTo(0.00055131, 12);
    expect(String(fetchMock.mock.calls[0][0])).toContain('bcdata.sgs.12/dados?formato=json&dataInicial=01/10/2026');
    const ipca = await fetchIPCA('2026-08-20');
    expect(ipca).toHaveLength(1);
    expect(ipca[0].month).toBe('2026-08');
    expect(ipca[0].rate).toBeCloseTo(0.0035, 12);
  });
});
