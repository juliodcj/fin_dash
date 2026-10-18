import { useEffect, useState } from 'react';
import { WideFlowsChart, WideLineChart } from '../components/charts';
import { chartData, heat } from '../components/returns';
import { PeriodPicker } from '../components/ui';
import { describe } from '../lib/assets';
import { MESES, monthLabel } from '../lib/dates';
import { isAnnualized, monthlyFlows, PERIODS, shownReturn, stats, yearTable } from '../lib/finance';
import { brl, brl0, brlSigned, pct, qty, ratio, signed, tone } from '../lib/format';
import type { Period } from '../lib/types';
import { href } from '../router';
import { useApp } from '../state';
import { colorFor, usePortfolio, useSubject } from '../useData';
import { StatusLine } from './common';

const ACCENT = '#1F4FD1';

/** Painel da carteira para telas largas (artboard "Web · Painel" do protótipo). */
export function Painel() {
  const { settings } = useApp();
  const p = usePortfolio();
  const subject = useSubject();
  const [period, setPeriod] = useState<Period>(settings.defaultPeriod);
  const tickers = p.holdings.map((h) => h.ticker);

  // links da barra lateral para seções desta página (#ativos)
  useEffect(() => {
    const go = () => { if (location.hash === '#ativos') document.getElementById('ativos')?.scrollIntoView({ behavior: 'smooth' }); };
    go();
    window.addEventListener('hashchange', go);
    return () => window.removeEventListener('hashchange', go);
  }, []);

  const method = settings.method;
  const s = subject ? stats(subject.series, subject.bench, period, method) : null;
  const ann = s ? isAnnualized(settings.annualize, s.days) : false;
  const show = (r: number | null) => (s ? shownReturn(r, s.days, settings.annualize) : null);
  const pl = period === 'MAX' ? 'total' : PERIODS.find((x) => x.id === period)!.label;
  const chart = subject && s ? chartData(subject, s, 'Carteira', ACCENT, true, method) : null;
  const flows = subject ? monthlyFlows(subject.series) : [];
  const last = flows[flows.length - 1];
  const years = subject ? yearTable(subject.series, subject.bench) : [];
  const income = p.income.filter((x) => Math.abs(x.value) >= 0.5).sort((a, b) => b.value - a.value);

  return (
    <div className="painel">
      <header className="painel-head">
        <div>
          <h1>Minha carteira</h1>
          <StatusLine className="painel-status" withRates />
        </div>
        <PeriodPicker value={period} onChange={setPeriod} wide />
      </header>

      <section className="kpis">
        <div className="kpi">
          <span className="kpi-label">Patrimônio</span>
          <span className="kpi-value">{brl(p.total)}</span>
          <span className="kpi-sub">investido {brl(p.invested)}</span>
        </div>
        <div className="kpi">
          <span className="kpi-label">Hoje</span>
          <span className={`kpi-value ${tone(p.today)}`}>{pct(p.todayPct)}</span>
          <span className={`kpi-sub strong ${tone(p.today)}`}>{brlSigned(p.today)}</span>
        </div>
        <div className="kpi">
          <span className="kpi-label">Rentabilidade · {pl}{ann ? ' a.a.' : ''}{method === 'mwrr' ? ' · MWRR' : ''}</span>
          <span className={`kpi-value ${tone(s?.ret)}`}>{pct(show(s?.ret ?? null))}</span>
          <span className="kpi-sub">CDI {pct(show(s?.cdi ?? null))} · IPCA {pct(show(s?.ipca ?? null))}</span>
        </div>
        <div className="kpi">
          <span className="kpi-label">% do CDI · {pl}</span>
          <span className="kpi-value">{ratio(s?.pctCdi)}</span>
          <span className="kpi-sub">carteira ÷ CDI no período</span>
        </div>
        <div className="kpi">
          <span className="kpi-label">Ganho real a.a. · {pl}</span>
          {s?.realAnnual != null
            ? <span className="kpi-value real">IPCA {s.realAnnual < 0 ? '−' : '+'} {pct(Math.abs(s.realAnnual), 2, false)}</span>
            : <span className="kpi-value real soft">a partir de 12M</span>}
          <span className="kpi-sub">acima da inflação, por ano</span>
        </div>
      </section>

      <div className="painel-row">
        <section className="pcard chart-card">
          <div className="pcard-head">
            <h2>Carteira vs CDI vs IPCA</h2>
            <div className="legend-row">
              <span><i style={{ background: ACCENT }} />Carteira</span>
              <span><i style={{ background: '#D9730D' }} />CDI</span>
              <span><i className="dashed" />IPCA</span>
            </div>
          </div>
          {chart ? <WideLineChart labels={chart.labels} tips={chart.tips} lines={chart.lines} /> : <p className="muted">Aguardando cotações para calcular a rentabilidade…</p>}
        </section>

        <section className="pcard alloc-card">
          <h2>Alocação</h2>
          <div className="alloc-list">
            {p.holdings.map((h) => {
              const target = settings.targets[h.ticker];
              return (
                <div key={h.ticker} className="alloc-item">
                  <div className="alloc-line"><b>{h.ticker}</b><span><b>{pct(h.weight, 1, false)}</b>{target != null && <span className="muted"> / alvo {pct(target, 0, false)}</span>}</span></div>
                  <div className="alloc-track"><div style={{ width: `${h.weight * 100}%`, background: colorFor(h.ticker, tickers) }} /></div>
                </div>
              );
            })}
          </div>
          {s && (
            <div className="alloc-metrics">
              <div><span>Volatilidade · {pl}</span><b>{s.vol == null ? '—' : `${pct(s.vol, 1, false)} a.a.`}</b></div>
              <div><span>Índice de Sharpe</span><b className={tone(s.sharpe)}>{signed(s.sharpe)}</b></div>
              <div><span>Meses positivos</span><b>{s.positive} de {s.months.length}</b></div>
              <div><span>Max drawdown</span><b className="neg">{pct(s.drawdown.value)}</b></div>
              <div><span>Melhor mês</span><b className="pos">{s.best ? `${pct(s.best.r)} · ${monthLabel(s.best.month)}` : '—'}</b></div>
              <div><span>Pior mês</span><b className={s.worst && s.worst.r < 0 ? 'neg' : 'pos'}>{s.worst ? `${pct(s.worst.r)} · ${monthLabel(s.worst.month)}` : '—'}</b></div>
            </div>
          )}
        </section>
      </div>

      <div className="painel-row top">
        <section id="ativos" className="pcard table-card assets-card">
          <h2>Ativos</h2>
          <div className="table-wrap">
            <table className="dtable" style={{ minWidth: 620 }}>
              <thead>
                <tr>
                  <th scope="col">Ativo</th>
                  <th scope="col">Qtd.</th>
                  <th scope="col">Preço médio</th>
                  <th scope="col">Cotação</th>
                  <th scope="col">Hoje</th>
                  <th scope="col">Valor</th>
                  <th scope="col">Resultado</th>
                </tr>
              </thead>
              <tbody>
                {p.holdings.map((h) => (
                  <tr key={h.ticker}>
                    <th scope="row">
                      <a href={href.ativo(h.ticker)} className="asset-cell"><b>{h.ticker}</b><span>{describe(h.ticker, h.name)}</span></a>
                    </th>
                    <td>{qty(h.qty)}</td>
                    <td>{brl(h.avgPrice)}</td>
                    <td className="semi">{brl(h.price)}</td>
                    <td className={`semi ${tone(h.changePct)}`}>{pct(h.changePct)}</td>
                    <td className="semi">{brl(h.value)}</td>
                    <td className={`strong ${tone(h.result)}`}>{pct(h.result)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {subject && (
          <section className="pcard table-card period-card">
            <h2>Por período</h2>
            <div className="table-wrap">
              <table className="dtable" style={{ minWidth: 440 }}>
                <thead>
                  <tr>
                    <th scope="col">Período</th>
                    <th scope="col" className="accent-col">Carteira</th>
                    <th scope="col">CDI</th>
                    <th scope="col">IPCA</th>
                    <th scope="col">% CDI</th>
                    <th scope="col">IPCA + a.a.</th>
                  </tr>
                </thead>
                <tbody>
                  {PERIODS.map((x) => {
                    const r = stats(subject.series, subject.bench, x.id, method);
                    const sh = (v: number | null) => shownReturn(v, r.days, settings.annualize);
                    const a = isAnnualized(settings.annualize, r.days);
                    return (
                      <tr key={x.id} className={x.id === period ? 'on' : ''}>
                        <th scope="row">{x.id === 'YTD' ? r.end.slice(0, 4) : x.id === 'MAX' ? 'Total' : x.label}{a && <span className="aa">a.a.</span>}</th>
                        <td className={`strong ${r.cdi != null && r.ret >= r.cdi ? 'pos' : ''}`}>{pct(sh(r.ret))}</td>
                        <td>{pct(sh(r.cdi))}</td>
                        <td>{pct(sh(r.ipca))}</td>
                        <td className="semi">{ratio(r.pctCdi)}</td>
                        <td className={`semi ${r.realAnnual == null ? 'soft' : r.realAnnual < 0 ? 'neg' : ''}`}>{pct(r.realAnnual)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </div>

      {last && (
        <section className="pcard flows-card">
          <div className="flows-side">
            <h2>Aportes × rendimento</h2>
            <div className="flows-num">
              <span className="kpi-label"><i className="sw" style={{ background: '#B9CBF4' }} />Aportado</span>
              <b>{brl0(last.invested)}</b>
              <span className="kpi-sub">{last.value > 0 ? `${pct(last.invested / last.value, 0, false)} do patrimônio` : ''}</span>
            </div>
            <div className="flows-num">
              <span className="kpi-label"><i className="sw" style={{ background: ACCENT }} />Rendimento</span>
              <b className={tone(last.value - last.invested)}>{brl0(last.value - last.invested)}</b>
              <span className="kpi-sub">
                {[last.value > 0 ? pct((last.value - last.invested) / last.value, 0, false) : '', ...income.map((x) => `${x.ticker} ${brl0(x.value)}`)].filter(Boolean).join(' · ')}
              </span>
            </div>
          </div>
          <div className="flows-chart"><WideFlowsChart flows={flows} color={ACCENT} /></div>
        </section>
      )}

      {years.length > 0 && (
        <section id="analise" className="pcard">
          <h2>Retornos mensais da carteira</h2>
          <div className="table-wrap">
            <table className="mtable">
              <thead>
                <tr>
                  <th scope="col" className="left">Ano</th>
                  {MESES.map((m) => <th key={m} scope="col">{m}</th>)}
                  <th scope="col" className="ink">No ano</th>
                  <th scope="col">CDI</th>
                </tr>
              </thead>
              <tbody>
                {years.map((y) => (
                  <tr key={y.year}>
                    <th scope="row" className="left">{y.year}</th>
                    {y.months.map((r, i) => <td key={i} className={`mcell ${heat(r)}`}>{r == null ? '–' : pct(r, 1).replace('%', '')}</td>)}
                    <td className="ytot">{pct(y.total)}</td>
                    <td className="ycdi">{pct(y.cdi)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
