import { useEffect, useRef, useState, type PointerEvent, type ReactNode } from 'react';
import { niceAxis, type MonthFlow } from '../lib/finance';
import { brl0, pct } from '../lib/format';
import { monthLabel } from '../lib/dates';

/** largura do contêiner, acompanhando redimensionamento */
function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [w, setW] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    setW(el.clientWidth);
    const ro = new ResizeObserver(() => setW(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

const PL = 44; // espaço do eixo Y
const PR = 6;
const PT = 10;
const PB = 26; // espaço do eixo X

interface FrameProps {
  height: number;
  n: number;
  axis: { lo: number; hi: number; ticks: number[] };
  yLabel: (v: number) => string;
  xTicks: { i: number; label: string }[];
  label: string;
  /** desenha as séries; recebe as funções de escala */
  children: (x: (i: number) => number, y: (v: number) => number) => ReactNode;
  tooltip?: (i: number) => ReactNode;
  zeroLine?: boolean;
}

function Frame({ height, n, axis, yLabel, xTicks, label, children, tooltip, zeroLine = true }: FrameProps) {
  const [ref, w] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const width = Math.max(w, 200);
  const x = (i: number) => PL + (n > 1 ? (i / (n - 1)) * (width - PL - PR) : 0);
  const y = (v: number) => height - PB - ((v - axis.lo) / (axis.hi - axis.lo)) * (height - PB - PT);
  const onMove = (e: PointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const i = Math.round(((e.clientX - r.left - PL) / (width - PL - PR)) * (n - 1));
    setHover(Math.min(n - 1, Math.max(0, i)));
  };
  const tipLeft = hover != null ? Math.min(Math.max(x(hover) - 70, 0), width - 140) : 0;

  return (
    <div ref={ref} className="chart" style={{ height }}>
      {w > 0 && (
        <svg width={width} height={height} role="img" aria-label={label} onPointerMove={tooltip ? onMove : undefined} onPointerLeave={() => setHover(null)}>
          {axis.ticks.map((t) => (
            <g key={t}>
              <line x1={PL} x2={width - PR} y1={y(t)} y2={y(t)} className={zeroLine && Math.abs(t) < 1e-9 ? 'grid zero' : 'grid'} />
              <text x={PL - 6} y={y(t) + 3.5} textAnchor="end" className="axis-label">{yLabel(t)}</text>
            </g>
          ))}
          <line x1={PL} x2={PL} y1={PT} y2={height - PB} className="axis" />
          <line x1={PL} x2={width - PR} y1={height - PB} y2={height - PB} className="axis" />
          {xTicks.map((t, k) => (
            <g key={k}>
              <line x1={x(t.i)} x2={x(t.i)} y1={height - PB} y2={height - PB + 5} className="axis" />
              <text x={x(t.i)} y={height - 8} className="axis-label" textAnchor={k === 0 ? 'start' : k === xTicks.length - 1 ? 'end' : 'middle'}>{t.label}</text>
            </g>
          ))}
          {children(x, y)}
          {hover != null && <line x1={x(hover)} x2={x(hover)} y1={PT} y2={height - PB} className="hover-line" />}
        </svg>
      )}
      {hover != null && tooltip && <div className="tooltip" style={{ left: tipLeft }}>{tooltip(hover)}</div>}
    </div>
  );
}

const ticksFor = (n: number, label: (i: number) => string) =>
  [...new Set([0, Math.round((n - 1) / 3), Math.round((2 * (n - 1)) / 3), n - 1])].map((i) => ({ i, label: label(i) }));

const pctAxisLabel = (step: number) => (v: number) => pct(v, step < 0.01 ? 1 : 0);

export interface ChartLine {
  key: string;
  label: string;
  /** retorno acumulado (fração) em cada ponto */
  values: number[];
  color: string;
  dashed?: boolean;
  width?: number;
}

export function LineChart({ dates, lines, xLabel, height = 210 }: { dates: string[]; lines: ChartLine[]; xLabel: (iso: string) => string; height?: number }) {
  const n = dates.length;
  if (n < 2) return <p className="chart-empty">Ainda não há histórico suficiente para o gráfico.</p>;
  const all = lines.flatMap((l) => l.values).concat(0);
  const axis = niceAxis(Math.min(...all), Math.max(...all));
  const main = lines[0];
  return (
    <Frame
      height={height}
      n={n}
      axis={axis}
      yLabel={pctAxisLabel(axis.step)}
      xTicks={ticksFor(n, (i) => xLabel(dates[i]))}
      label={`Gráfico de rentabilidade acumulada: ${lines.map((l) => `${l.label} ${pct(l.values[n - 1])}`).join(', ')}`}
      tooltip={(i) => (
        <>
          <b>{xLabel(dates[i])}</b>
          {lines.map((l) => (
            <span key={l.key} className="tip-row"><i style={{ background: l.color }} />{l.label} {pct(l.values[i])}</span>
          ))}
        </>
      )}
    >
      {(x, y) => (
        <>
          {[...lines].reverse().map((l) => (
            <polyline
              key={l.key}
              points={l.values.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ')}
              fill="none"
              stroke={l.color}
              strokeWidth={l.width ?? 1.75}
              strokeDasharray={l.dashed ? '4 4' : undefined}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          ))}
          <circle cx={x(n - 1)} cy={y(main.values[n - 1])} r={4} fill={main.color} stroke="#fff" strokeWidth={2} />
        </>
      )}
    </Frame>
  );
}

export function DrawdownChart({ dates, index, xLabel, height = 160 }: { dates: string[]; index: number[]; xLabel: (iso: string) => string; height?: number }) {
  const n = dates.length;
  if (n < 2) return <p className="chart-empty">Ainda não há histórico suficiente para o gráfico.</p>;
  let peak = -Infinity;
  const dd = index.map((v) => { peak = Math.max(peak, v); return v / peak - 1; });
  const axis = niceAxis(Math.min(...dd, -0.01), 0);
  return (
    <Frame
      height={height}
      n={n}
      axis={axis}
      yLabel={pctAxisLabel(axis.step)}
      xTicks={ticksFor(n, (i) => xLabel(dates[i]))}
      label={`Gráfico de drawdown, queda máxima de ${pct(Math.min(...dd))}`}
      tooltip={(i) => (<><b>{xLabel(dates[i])}</b><span className="tip-row">{pct(dd[i])} do topo</span></>)}
      zeroLine={false}
    >
      {(x, y) => {
        const pts = dd.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
        return (
          <>
            <polygon points={`${x(0)},${y(0)} ${pts} ${x(n - 1)},${y(0)}`} fill="var(--neg-soft)" />
            <polyline points={pts} fill="none" stroke="var(--neg)" strokeWidth={1.5} strokeLinejoin="round" />
          </>
        );
      }}
    </Frame>
  );
}

const thousands = (v: number) => (v === 0 ? '0' : v >= 1000 ? `${(v / 1000).toLocaleString('pt-BR')} mil` : String(v));

export function FlowsChart({ flows, color, height = 210 }: { flows: MonthFlow[]; color: string; height?: number }) {
  const n = flows.length;
  if (!n) return <p className="chart-empty">Ainda não há meses completos para mostrar.</p>;
  const mx = Math.max(...flows.map((f) => Math.max(f.value, f.invested)), 1);
  const steps = [50, 100, 200, 250, 500, 1000, 2000, 2500, 5000, 10000, 20000, 25000, 50000, 100000, 200000, 250000, 500000, 1e6, 2e6, 5e6];
  const axis = niceAxis(0, mx, steps);
  return (
    <Frame
      height={height}
      n={n}
      axis={axis}
      yLabel={thousands}
      xTicks={ticksFor(n, (i) => monthLabel(flows[i].month))}
      label={`Gráfico mensal de aportes e rendimento. Último mês: aportado ${brl0(flows[n - 1].invested)}, patrimônio ${brl0(flows[n - 1].value)}`}
      tooltip={(i) => (
        <>
          <b>{monthLabel(flows[i].month)}</b>
          <span className="tip-row"><i style={{ background: 'var(--accent-soft)' }} />Aportado {brl0(flows[i].invested)}</span>
          <span className="tip-row"><i style={{ background: color }} />Rendimento {brl0(flows[i].value - flows[i].invested)}</span>
        </>
      )}
      zeroLine={false}
    >
      {(x, y) => {
        // barras centradas nas posições do eixo X
        const slot = n > 1 ? x(1) - x(0) : 24;
        const bw = Math.max(2, Math.min(28, slot * 0.7));
        return flows.map((f, i) => {
          const low = Math.min(f.invested, f.value);
          const left = n > 1 ? Math.min(Math.max(x(i) - bw / 2, PL + 1), x(n - 1) - bw) : PL + 12;
          return (
            <g key={f.month}>
              <rect x={left} width={bw} y={y(low)} height={Math.max(0, y(0) - y(low))} fill="var(--accent-soft)" />
              {f.value > f.invested && <rect x={left} width={bw} y={y(f.value)} height={y(f.invested) - y(f.value)} fill={color} />}
              {f.value < f.invested && <rect x={left} width={bw} y={y(f.invested)} height={y(f.value) - y(f.invested)} fill="var(--neg)" opacity={0.75} />}
            </g>
          );
        });
      }}
    </Frame>
  );
}
