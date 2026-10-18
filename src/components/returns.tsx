import { useState } from 'react';
import { dateBR, dayMonth, monthLabel } from '../lib/dates';
import { isAnnualized, mwrr, PERIODS, realGain, shownReturn, stats, type Stats } from '../lib/finance';
import { brlSigned, pct, ratio, signed, tone } from '../lib/format';
import type { Method, Period } from '../lib/types';
import type { Subject } from '../useData';
import { chartPoints, LineChart, type ChartLine } from './charts';
import { Icon, Legend, PeriodPicker } from './ui';

export const xLabelFor = (days: number) => (iso: string) => (days <= 45 ? dayMonth(iso) : monthLabel(iso.slice(0, 7)));

const CDI_COLOR = '#D9730D';
const IPCA_COLOR = '#8A8F98';

/** texto do período no canto do cartão, como no protótipo */
export function rangeText(s: Stats, annualized: boolean, variant: 'portfolio' | 'asset' = 'portfolio', method: Method = 'twr') {
  let t: string;
  if (s.period === '1M') t = 'últimos 30 dias';
  else if (s.period === 'YTD') t = `${s.end.slice(0, 4)} até hoje`;
  else if (s.period === 'MAX') t = variant === 'asset' ? 'desde a 1ª compra' : `desde ${monthLabel(s.start.slice(0, 7))}`;
  else t = `${monthLabel(s.start.slice(0, 7))} → hoje`;
  return `${t}${annualized ? ' · ao ano' : ''}${method === 'mwrr' ? ' · MWRR' : ''}`;
}

/** séries do cartão de rentabilidade, rebaseadas no início da janela e amostradas como no protótipo */
export function chartData(subject: Subject, s: Stats, label: string, color: string, wide = false, method: Method = 'twr') {
  const { series, bench } = subject;
  const idx = chartPoints(s.i0, s.i1);
  // TWR: índice rebaseado; MWRR: TIR acumulada do início da janela até cada ponto
  const rebase = (arr: number[]) => {
    if (method === 'twr') return idx.map((i) => arr[i] / arr[s.i0] - 1);
    let last = 0;
    return idx.map((i) => (last = mwrr(series, arr, s.i0, i) ?? last));
  };
  const lines: ChartLine[] = [{ key: 'main', label, values: rebase(series.index), color, width: wide ? 2.75 : 2.5 }];
  if (bench.hasCdi) lines.push({ key: 'cdi', label: 'CDI', values: rebase(bench.cdi), color: CDI_COLOR, width: wide ? 2 : 1.75 });
  if (bench.hasIpca) lines.push({ key: 'ipca', label: 'IPCA', values: rebase(bench.ipca), color: IPCA_COLOR, dashed: true, width: 1.5 });
  const fmt = xLabelFor(s.days);
  return { labels: idx.map((i) => fmt(series.dates[i])), tips: idx.map((i) => dateBR(series.dates[i])), lines };
}

/** "IPCA + 2,31%" */
export function realText(r: number | null) {
  if (r == null) return null;
  return `IPCA ${r < 0 ? '−' : '+'} ${pct(Math.abs(r), 2, false)}`;
}

interface Props {
  subject: Subject;
  label: string;
  color: string;
  period: Period;
  onPeriod: (p: Period) => void;
  annualize: boolean;
  method: Method;
  /** carteira: indicadores em bloco recolhível; ativo: linha com 3 indicadores */
  variant: 'portfolio' | 'asset';
}

export function ReturnCard({ subject, label, color, period, onPeriod, annualize, method, variant }: Props) {
  const [open, setOpen] = useState(false);
  const s = stats(subject.series, subject.bench, period, method);
  const ann = isAnnualized(annualize, s.days);
  const show = (r: number | null) => shownReturn(r, s.days, annualize);
  const real = realText(realGain(s, annualize));
  const chart = chartData(subject, s, label, color, false, method);
  const ddWhen = s.drawdown.trough ? `fundo em ${xLabelFor(s.days)(s.drawdown.trough)}` : 'sem queda no período';

  return (
    <section className="card returns">
      <div className="card-head">
        <h2>Rentabilidade</h2>
        <span className="muted small">{rangeText(s, ann, variant, method)}</span>
      </div>
      <PeriodPicker value={period} onChange={onPeriod} light />
      {s.truncated && period !== 'MAX' && (
        <p className="note">O histórico começa em {dayMonth(s.start)}; o período mostrado é menor que {PERIODS.find((p) => p.id === period)?.label}.</p>
      )}

      <div className="trio">
        <div>
          <Legend color={color}>{label}</Legend>
          <span className={`big ${tone(s.ret)}`}>{pct(show(s.ret))}</span>
          <span className={`gain ${tone(s.gain)}`}>{brlSigned(s.gain)}</span>
        </div>
        <div>
          <Legend color={CDI_COLOR}>CDI</Legend>
          <span className="big plain">{pct(show(s.cdi))}</span>
        </div>
        <div>
          <Legend color={IPCA_COLOR} dashed>IPCA</Legend>
          <span className="big plain">{pct(show(s.ipca))}</span>
        </div>
      </div>

      <div className="duo">
        <div className="tile">
          <span className="tile-label">% do CDI</span>
          <span className="tile-value">{ratio(s.pctCdi)}</span>
        </div>
        <div className="tile">
          <span className="tile-label">Ganho real</span>
          {real ? <span className="tile-value">{real}</span> : <span className="tile-value soft">—</span>}
        </div>
      </div>

      <LineChart labels={chart.labels} tips={chart.tips} lines={chart.lines} />

      {variant === 'asset' ? (
        <div className="metrics3">
          <Metric label="Max drawdown" value={pct(s.drawdown.value)} cls="neg" />
          <Metric label="Volatilidade a.a." value={s.vol == null ? '—' : pct(s.vol, 1, false)} />
          <Metric label="Sharpe" value={signed(s.sharpe)} cls={tone(s.sharpe)} />
        </div>
      ) : (
        <div className="more">
          <button type="button" className="more-btn" aria-expanded={open} aria-controls="mais-indicadores" onClick={() => setOpen(!open)}>
            Mais indicadores
            <span className={open ? 'rot' : ''}>{Icon.down(18)}</span>
          </button>
          {open && (
            <div id="mais-indicadores" className="more-grid">
              <Metric label="Max drawdown" value={pct(s.drawdown.value)} cls="neg" hint={ddWhen} />
              <Metric label="Volatilidade a.a." value={s.vol == null ? '—' : pct(s.vol, 1, false)} hint={s.vol == null ? 'período curto demais' : 'oscilação diária'} />
              <Metric label="Índice de Sharpe" value={signed(s.sharpe)} cls={tone(s.sharpe)} hint={s.sharpe == null ? 'a partir de 6M' : 'retorno vs CDI ÷ risco'} />
              <Metric label="Meses positivos" value={`${s.positive} de ${s.months.length}`} hint="no período" />
              <Metric label="Melhor mês" value={pct(s.best?.r)} cls="pos" hint={s.best ? monthLabel(s.best.month) : ''} />
              <Metric label="Pior mês" value={pct(s.worst?.r)} cls={s.worst && s.worst.r < 0 ? 'neg' : 'pos'} hint={s.worst ? monthLabel(s.worst.month) : ''} />
            </div>
          )}
        </div>
      )}
    </section>
  );
}

export function Metric({ label, value, hint, cls = '' }: { label: string; value: string; hint?: string; cls?: string }) {
  return (
    <div className="metric">
      <span className="metric-label">{label}</span>
      <span className={`metric-value ${cls}`}>{value}</span>
      {hint != null && <span className="metric-hint">{hint || ' '}</span>}
    </div>
  );
}

/** Tabela de rentabilidade por período (Análise e web). */
export function PeriodTable({ subject, label, annualize, method }: { subject: Subject; label: string; annualize: boolean; method: Method }) {
  const rows = PERIODS.map((p) => {
    const s = stats(subject.series, subject.bench, p.id, method);
    const ann = isAnnualized(annualize, s.days);
    return { p, s, ann, real: realGain(s, annualize), label: p.id === 'YTD' ? s.end.slice(0, 4) : p.id === 'MAX' ? 'Total' : p.label };
  });
  return (
    <div className="table-wrap">
      <table className="ptable">
        <thead>
          <tr>
            <th scope="col">Período</th>
            <th scope="col" className="accent-col">{label}</th>
            <th scope="col">CDI</th>
            <th scope="col">% CDI</th>
            <th scope="col">IPCA + x%</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ p, s, ann, real, label: l }) => (
            <tr key={p.id}>
              <th scope="row">
                {l}
                {ann && <span className="aa">a.a.</span>}
              </th>
              <td className={`strong ${s.cdi != null && s.ret >= s.cdi ? 'pos' : ''}`}>{pct(shownReturn(s.ret, s.days, annualize))}</td>
              <td>{pct(shownReturn(s.cdi, s.days, annualize))}</td>
              <td className="semi">{ratio(s.pctCdi)}</td>
              <td className={`semi ${real == null ? 'soft' : tone(real) === 'neg' ? 'neg' : ''}`}>{pct(real)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** classe da cor do mapa de retornos mensais */
export function heat(r: number | null) {
  if (r == null) return 'h-none';
  if (r >= 0.03) return 'h-p3';
  if (r >= 0.01) return 'h-p2';
  if (r > 0.0004) return 'h-p1';
  if (r > -0.0004) return 'h-0';
  if (r > -0.01) return 'h-n1';
  if (r > -0.03) return 'h-n2';
  return 'h-n3';
}
