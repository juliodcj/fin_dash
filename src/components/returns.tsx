import { useState } from 'react';
import { dayMonth, monthLabel } from '../lib/dates';
import { isAnnualized, PERIODS, shownReturn, stats, type Stats } from '../lib/finance';
import { pct, ratio, signed, tone } from '../lib/format';
import type { Period } from '../lib/types';
import type { Subject } from '../useData';
import { LineChart, type ChartLine } from './charts';
import { Icon, Legend, PeriodPicker } from './ui';

export const xLabelFor = (days: number) => (iso: string) => (days <= 200 ? dayMonth(iso) : monthLabel(iso.slice(0, 7)));

const CDI_COLOR = '#D9730D';
const IPCA_COLOR = '#8A8F98';

function rangeText(s: Stats, annualized: boolean) {
  const from = s.days <= 200 ? dayMonth(s.start) : monthLabel(s.start.slice(0, 7));
  return `desde ${from}${annualized ? ' · ao ano' : ''}`;
}

function realText(s: Stats) {
  if (s.realAnnual == null) return null;
  return `IPCA ${s.realAnnual < 0 ? '−' : '+'} ${pct(Math.abs(s.realAnnual), 2, false)}`;
}

interface Props {
  subject: Subject;
  label: string;
  color: string;
  period: Period;
  onPeriod: (p: Period) => void;
  annualize: boolean;
  /** carteira: indicadores em bloco recolhível; ativo: linha com 3 indicadores */
  variant: 'portfolio' | 'asset';
}

export function ReturnCard({ subject, label, color, period, onPeriod, annualize, variant }: Props) {
  const [open, setOpen] = useState(false);
  const { series, bench } = subject;
  const s = stats(series, bench, period);
  const ann = isAnnualized(annualize, s.days);
  const show = (r: number | null) => shownReturn(r, s.days, annualize);
  const real = realText(s);

  const rebase = (arr: number[]) => arr.slice(s.i0, s.i1 + 1).map((v) => v / arr[s.i0] - 1);
  const lines: ChartLine[] = [{ key: 'main', label, values: rebase(series.index), color, width: 2.5 }];
  if (bench.hasCdi) lines.push({ key: 'cdi', label: 'CDI', values: rebase(bench.cdi), color: CDI_COLOR });
  if (bench.hasIpca) lines.push({ key: 'ipca', label: 'IPCA', values: rebase(bench.ipca), color: IPCA_COLOR, dashed: true, width: 1.5 });

  const ddWhen = s.drawdown.trough ? `fundo em ${xLabelFor(s.days)(s.drawdown.trough)}` : 'sem queda no período';
  const monthsHint = s.months.length ? `de ${s.months.length} ${s.months.length === 1 ? 'mês' : 'meses'}` : '';

  return (
    <section className="card returns">
      <div className="card-head">
        <h2>Rentabilidade</h2>
        <span className="muted small">{rangeText(s, ann)}</span>
      </div>
      <PeriodPicker value={period} onChange={onPeriod} />
      {s.truncated && period !== 'MAX' && (
        <p className="note">O histórico começa em {dayMonth(s.start)}; o período mostrado é menor que {PERIODS.find((p) => p.id === period)?.label}.</p>
      )}

      <div className="trio">
        <div>
          <Legend color={color}>{label}</Legend>
          <span className={`big ${tone(s.ret)}`}>{pct(show(s.ret))}</span>
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
          <span className="tile-label">Ganho real a.a.</span>
          {real ? <span className="tile-value">{real}</span> : <span className="tile-value soft">a partir de 12M</span>}
        </div>
      </div>

      <LineChart dates={series.dates.slice(s.i0, s.i1 + 1)} lines={lines} xLabel={xLabelFor(s.days)} />

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
              <Metric label="Meses positivos" value={`${s.positive} ${monthsHint}`} hint="no período" />
              <Metric label="Melhor mês" value={pct(s.best?.r)} cls={tone(s.best?.r)} hint={s.best ? monthLabel(s.best.month) : ''} />
              <Metric label="Pior mês" value={pct(s.worst?.r)} cls={tone(s.worst?.r)} hint={s.worst ? monthLabel(s.worst.month) : ''} />
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
export function PeriodTable({ subject, label, annualize }: { subject: Subject; label: string; annualize: boolean }) {
  const rows = PERIODS.map((p) => {
    const s = stats(subject.series, subject.bench, p.id);
    const ann = isAnnualized(annualize, s.days);
    return { p, s, ann, label: p.id === 'YTD' ? s.end.slice(0, 4) : p.id === 'MAX' ? 'Total' : p.label };
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
            <th scope="col">IPCA + a.a.</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ p, s, ann, label: l }) => (
            <tr key={p.id}>
              <th scope="row">
                {l}
                {ann && <span className="aa">a.a.</span>}
              </th>
              <td className={`strong ${s.cdi != null && s.ret >= s.cdi ? 'pos' : ''}`}>{pct(shownReturn(s.ret, s.days, annualize))}</td>
              <td>{pct(shownReturn(s.cdi, s.days, annualize))}</td>
              <td className="semi">{ratio(s.pctCdi)}</td>
              <td className={`semi ${s.realAnnual == null ? 'soft' : tone(s.realAnnual) === 'neg' ? 'neg' : ''}`}>{pct(s.realAnnual)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
