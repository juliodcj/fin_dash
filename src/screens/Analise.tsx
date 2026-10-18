import { useState } from 'react';
import { DrawdownChart, FlowsChart } from '../components/charts';
import { heat, Metric, PeriodTable } from '../components/returns';
import { Icon } from '../components/ui';
import { MESES, monthLabel } from '../lib/dates';
import { monthlyFlows, stats, yearTable } from '../lib/finance';
import { brl0, pct, signed, tone } from '../lib/format';
import { href } from '../router';
import { useApp } from '../state';
import { colorFor, usePortfolio, useSubject } from '../useData';

export function Analise() {
  const { trades, settings } = useApp();
  const p = usePortfolio();
  const tickers = [...new Set(trades.map((t) => t.ticker))].sort();
  const [sel, setSel] = useState('');
  const ticker = tickers.includes(sel) ? sel : '';
  const subject = useSubject(ticker || undefined);
  const label = ticker || 'Carteira';
  const holdTickers = p.holdings.map((h) => h.ticker);
  const color = ticker ? colorFor(ticker, holdTickers.length ? holdTickers : [ticker]) : 'var(--accent)';

  const head = (
    <header className="screen-head">
      <h1>Análise</h1>
      {tickers.length > 0 && (
        <div className="select-wrap">
          <select aria-label="Escolher carteira ou ativo" value={ticker} onChange={(e) => setSel(e.target.value)}>
            <option value="">Carteira</option>
            <optgroup label="Ativos">
              {tickers.map((t) => <option key={t} value={t}>{t}</option>)}
            </optgroup>
          </select>
          {Icon.down(16)}
        </div>
      )}
    </header>
  );

  if (!trades.length) {
    return (
      <div className="screen">{head}
        <section className="card empty"><p className="muted">Cadastre um lançamento para ver a análise.</p><a className="btn" href={href.lancar()}>Novo lançamento</a></section>
      </div>
    );
  }
  if (!subject) {
    return <div className="screen">{head}<section className="card"><p className="muted">Aguardando cotações…</p></section></div>;
  }

  const { series, bench } = subject;
  const flows = monthlyFlows(series);
  const last = flows[flows.length - 1];
  const income = last.value - last.invested;
  const sMax = stats(series, bench, 'MAX');
  const dd = sMax.drawdown;
  const s12 = stats(series, bench, '12M');
  // meses positivos e média mensal: desde o início, como no protótipo
  const avgMonth = sMax.months.length ? sMax.months.reduce((a, m) => a + m.r, 0) / sMax.months.length : null;
  const years = yearTable(series, bench);
  const incomeRows = ticker ? [] : p.income.filter((x) => Math.abs(x.value) >= 0.5).sort((a, b) => b.value - a.value);
  const maxIncome = Math.max(...incomeRows.map((x) => Math.abs(x.value)), 1);

  return (
    <div className="screen analysis">
      {head}
      <div className="analysis-grid">
        <section className="card flush">
          <h2 className="pad-x">Rentabilidade por período</h2>
          <PeriodTable subject={subject} label={label} annualize={settings.annualize} />
          <p className="table-note">
            IPCA + a.a.: ganho acima da inflação por ano, calculado para períodos de 12 meses ou mais.
            {settings.annualize ? ' Linhas marcadas com a.a. estão anualizadas.' : ''}
          </p>
        </section>

        <section className="card">
          <h2>Aportes × rendimento</h2>
          <div className="duo">
            <div className="tile">
              <span className="tile-label"><i className="sw" style={{ background: 'var(--accent-soft)' }} />Aportado</span>
              <span className="tile-value">{brl0(last.invested)}</span>
              <span className="tile-hint">{last.value > 0 ? `${pct(last.invested / last.value, 0, false)} do patrimônio` : ' '}</span>
            </div>
            <div className="tile">
              <span className="tile-label"><i className="sw" style={{ background: color }} />Rendimento</span>
              <span className={`tile-value ${tone(income)}`}>{brl0(income)}</span>
              <span className="tile-hint">{last.value > 0 ? `${pct(income / last.value, 0, false)} do patrimônio` : ' '}</span>
            </div>
          </div>
          <FlowsChart flows={flows} color={color} />
          {incomeRows.length > 1 && (
            <div className="income">
              <span className="metric-label">Rendimento por ativo</span>
              {incomeRows.map((x) => (
                <div key={x.ticker} className="income-row">
                  <b>{x.ticker}</b>
                  <span className="bar"><span style={{ width: `${(Math.abs(x.value) / maxIncome) * 100}%`, background: x.value < 0 ? 'var(--neg)' : colorFor(x.ticker, holdTickers) }} /></span>
                  <span className={`num ${x.value < 0 ? 'neg' : ''}`}>{brl0(x.value)}</span>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="card">
          <div className="card-head"><h2>Drawdown</h2><span className="muted small">queda desde o topo</span></div>
          <div className="dd-head">
            <span className={`big ${dd.value < 0 ? 'neg' : ''}`}>{pct(dd.value)}</span>
            <span className="muted small">
              {dd.trough
                ? `Topo em ${monthLabel(dd.peak!.slice(0, 7))} · fundo em ${monthLabel(dd.trough.slice(0, 7))} · ${dd.recovered ? `recuperado em ${monthLabel(dd.recovered.slice(0, 7))}` : 'ainda não recuperado'}`
                : 'Sem quedas desde o início'}
            </span>
          </div>
          <DrawdownChart dates={series.dates} index={series.index} />
        </section>

        <section className="card">
          <h2>Retornos mensais</h2>
          {years.map((y) => (
            <div key={y.year} className="year">
              <div className="year-head">
                <b>{y.year}</b>
                <span className="muted small"><b className="ink">{pct(y.total)}</b>{y.cdi != null ? ` · CDI ${pct(y.cdi)}` : ''}</span>
              </div>
              <div className="heat">
                {y.months.map((r, i) => (
                  <div key={i} className={`cell ${heat(r)}`}>
                    <span>{MESES[i]}</span>
                    <b>{r == null ? '–' : pct(r, 1).replace('%', '')}</b>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </section>

        <section className="metrics4">
          <div className="card mini"><Metric label="Volatilidade 12M" value={s12.vol == null ? '—' : `${pct(s12.vol, 1, false)} a.a.`} /></div>
          <div className="card mini"><Metric label="Sharpe 12M" value={signed(s12.sharpe)} cls={tone(s12.sharpe)} /></div>
          <div className="card mini"><Metric label="Meses positivos" value={`${sMax.positive} de ${sMax.months.length}`} /></div>
          <div className="card mini"><Metric label="Média mensal" value={pct(avgMonth)} cls={tone(avgMonth)} /></div>
        </section>
      </div>
    </div>
  );
}
