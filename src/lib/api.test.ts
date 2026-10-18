import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchCDI, fetchIPCA, fetchQuote } from './api';

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

afterEach(() => vi.unstubAllGlobals());

describe('brapi', () => {
  it('converte o histórico, usa o ajustado e acrescenta o pregão atual', async () => {
    const fetchMock = vi.fn(async (_url: string) =>
      json(200, {
        results: [{
          symbol: 'WRLD11',
          longName: 'Investo FTSE Global',
          regularMarketPrice: 110,
          regularMarketChangePercent: 0.84,
          regularMarketTime: '2026-10-16T20:10:00.000Z',
          historicalDataPrice: [
            { date: Date.UTC(2026, 9, 14, 13) / 1000, close: 100, adjustedClose: 99 },
            { date: Date.UTC(2026, 9, 15, 3) / 1000, close: 105, adjustedClose: null },
            { date: Date.UTC(2026, 9, 15, 3) / 1000, close: null },
          ],
        }],
      }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const q = await fetchQuote('WRLD11', '2026-09-20', 'tok');
    expect(String(fetchMock.mock.calls[0][0])).toMatch(/\/quote\/WRLD11\?range=\w+&interval=1d&token=tok$/);
    expect(q.points.map((p) => p.date)).toEqual(['2026-10-14', '2026-10-15', '2026-10-16']);
    expect(q.points[0].adj).toBe(99);
    expect(q.points[1].adj).toBe(105);
    expect(q.points[2].close).toBe(110);
    expect(q.changePct).toBeCloseTo(0.0084, 10);
    expect(q.name).toBe('Investo FTSE Global');
  });

  it('tenta 3 meses quando o plano recusa o histórico longo', async () => {
    const fetchMock = vi.fn(async (url: string) =>
      url.includes('range=3mo')
        ? json(200, { results: [{ symbol: 'B5P211', regularMarketPrice: 120, historicalDataPrice: [{ date: Date.UTC(2026, 9, 16, 13) / 1000, close: 120 }] }] })
        : json(403, { message: 'range não permitido no seu plano' }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const q = await fetchQuote('B5P211', '2024-01-01', 'tok');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(q.price).toBe(120);
  });

  it('mostra a mensagem da brapi quando falha', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json(401, { message: 'token inválido' })));
    await expect(fetchQuote('PETR4', '2026-10-01', 'x')).rejects.toThrow('PETR4: token inválido');
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
