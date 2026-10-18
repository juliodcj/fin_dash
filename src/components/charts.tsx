import { useCallback, useEffect, useState, type PointerEvent, type ReactNode } from 'react';
import type { MonthFlow } from '../lib/finance';
import { brl0, pct } from '../lib/format';
import { monthLabel } from '../lib/dates';

/** largura do contêiner, acompanhando redimensionamento (ref de callback: funciona mesmo se o elemento aparece depois) */
function useWidth<T extends HTMLElement>() {
  const [el, setEl] = useState<T | null>(null);
  const [w, setW] = useState(0);
  const ref = useCallback((node: T | null) => setEl(node), []);
  useEffect(() => {
    if (!el) return;
    setW(el.clientWidth);
    const ro = new ResizeObserver(() => setW(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, [el]);
  return [ref, w] as const;
}

/**
 * Ponto sob o mouse ou o dedo. `toIndex` converte a posição x (px, relativa ao SVG) no índice.
 * No toque, o valor fica na tela depois de soltar o dedo; some ao tocar fora do gráfico.
 */
function useHover(toIndex: (x: number, width: number) => number | null) {
  const [hover, setHover] = useState<number | null>(null);
  const at = (e: PointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    setHover(toIndex(e.clientX - r.left, r.width));
  };
  useEffect(() => {
    if (hover == null) return;
    const off = (e: Event) => { if (!(e.target as Element).closest?.('.chart, .wide-chart')) setHover(null); };
    document.addEventListener('pointerdown', off);
    return () => document.removeEventListener('pointerdown', off);
  }, [hover]);
  const handlers = {
    onPointerDown: at,
    onPointerMove: at,
    onPointerLeave: (e: PointerEvent<SVGSVGElement>) => { if (e.pointerType === 'mouse') setHover(null); },
  };
  return [hover, handlers] as const;
}

export interface Axis {
  lo: number;
  hi: number;
  ticks: number[];
  step: number;
}

/** Escala do protótipo: até 4 intervalos "redondos", com marcações nas duas pontas. */
export function stepAxis(mn: number, mx: number, steps = [0.0025, 0.005, 0.01, 0.02, 0.025, 0.05, 0.1, 0.2, 0.25, 0.5, 1, 2, 5], maxSteps = 4): Axis {
  let step = steps[steps.length - 1];
  for (const s of steps) if ((mx - mn) / s <= maxSteps) { step = s; break; }
  const lo = Math.floor(mn / step + 1e-9) * step;
  let hi = Math.ceil(mx / step - 1e-9) * step;
  if (hi - lo < step) hi = lo + step;
  const ticks: number[] = [];
  for (let v = lo; v <= hi + step * 1e-6; v += step) ticks.push(Math.round(v * 1e9) / 1e9);
  return { lo, hi, ticks, step };
}

/** rótulo do eixo de rentabilidade: casas conforme o passo */
const pctTick = (step: number) => (v: number) => pct(v, step < 0.005 ? 2 : step < 0.01 ? 1 : 0);

/** pontos do gráfico: todos os pregões da janela (resolução diária) */
export function chartPoints(i0: number, i1: number): number[] {
  return Array.from({ length: i1 - i0 + 1 }, (_, k) => i0 + k);
}

const xTickIdx = (n: number) => [...new Set([0, Math.round((n - 1) / 3), Math.round((2 * (n - 1)) / 3), n - 1])];
const clampIdx = (j: number, n: number) => Math.min(n - 1, Math.max(0, j));

export interface ChartLine {
  key: string;
  label: string;
  /** retorno acumulado (fração) em cada ponto */
  values: number[];
  color: string;
  dashed?: boolean;
  width?: number;
}

const AXIS = '#8A8F98';
const GRID = '#EEEEEA';
const GRID_ZERO = '#BDBDB6';

function Tooltip({ x, width, children }: { x: number; width: number; children: ReactNode }) {
  return <div className="tooltip" style={{ left: Math.min(Math.max(x - 75, 0), Math.max(0, width - 150)) }}>{children}</div>;
}

function LineTip({ title, lines, j }: { title: string; lines: ChartLine[]; j: number }) {
  return (
    <>
      <b>{title}</b>
      {lines.map((l) => <span key={l.key} className="tip-row"><i style={{ background: l.color }} />{l.label} {pct(l.values[j])}</span>)}
    </>
  );
}

interface LineProps {
  /** rótulos do eixo X (mês/ano ou dia/mês) */
  labels: string[];
  /** data completa de cada ponto, para o valor sob o cursor */
  tips: string[];
  lines: ChartLine[];
}

/** Rentabilidade acumulada (celular): área de plotagem x 40 → largura−6, y 10 → 172. */
export function LineChart({ labels, tips, lines, height = 200 }: LineProps & { height?: number }) {
  const [ref, w] = useWidth<HTMLDivElement>();
  const n = labels.length;
  const W = Math.max(w, 200);
  const L = 40, R = W - 6, T = 10, B = height - 28;
  const [hover, on] = useHover((x) => clampIdx(Math.round(((x - L) / (R - L)) * (n - 1)), n));
  if (n < 2) return <p className="chart-empty">Ainda não há histórico suficiente para o gráfico.</p>;
  const all = lines.flatMap((l) => l.values);
  const ax = stepAxis(Math.min(0, ...all), Math.max(0, ...all));
  const X = (j: number) => L + (j / (n - 1)) * (R - L);
  const Y = (v: number) => B - ((v - ax.lo) / (ax.hi - ax.lo)) * (B - T);
  const tick = pctTick(ax.step);
  const main = lines[0];
  return (
    <div ref={ref} className="chart" style={{ height }}>
      {w > 0 && (
        <svg width={W} height={height} role="img" {...on}
          aria-label={`Gráfico de rentabilidade acumulada: ${lines.map((l) => `${l.label} ${pct(l.values[n - 1])}`).join(', ')}`}>
          {ax.ticks.map((t) => (
            <g key={t}>
              <line x1={L} x2={R} y1={Y(t)} y2={Y(t)} stroke={Math.abs(t) < 1e-9 ? GRID_ZERO : GRID} />
              <text x={L - 5} y={Y(t) + 3.5} textAnchor="end" className="axis-label">{tick(t)}</text>
            </g>
          ))}
          <line x1={L} x2={L} y1={T} y2={B} stroke={AXIS} />
          <line x1={L} x2={R} y1={B} y2={B} stroke={AXIS} />
          {xTickIdx(n).map((j, k, ts) => (
            <g key={j}>
              <line x1={X(j)} x2={X(j)} y1={B} y2={B + 5} stroke={AXIS} />
              <text x={X(j)} y={B + 20} className="axis-label" textAnchor={k === 0 ? 'start' : k === ts.length - 1 ? 'end' : 'middle'}>
                {k === ts.length - 1 ? 'hoje' : labels[j]}
              </text>
            </g>
          ))}
          {[...lines].reverse().map((l) => (
            <polyline key={l.key} points={l.values.map((v, j) => `${X(j).toFixed(1)},${Y(v).toFixed(1)}`).join(' ')}
              fill="none" stroke={l.color} strokeWidth={l.width ?? 1.75} strokeDasharray={l.dashed ? '4 4' : undefined}
              strokeLinejoin="round" strokeLinecap={l === main ? 'round' : undefined} />
          ))}
          {hover == null && <circle cx={X(n - 1)} cy={Y(main.values[n - 1])} r={4} fill={main.color} stroke="#fff" strokeWidth={2} />}
          {hover != null && (
            <>
              <line x1={X(hover)} x2={X(hover)} y1={T} y2={B} className="hover-line" />
              {lines.map((l) => <circle key={l.key} cx={X(hover)} cy={Y(l.values[hover])} r={3.5} fill={l.color} stroke="#fff" strokeWidth={1.5} />)}
            </>
          )}
        </svg>
      )}
      {hover != null && <Tooltip x={X(hover)} width={W}><LineTip title={tips[hover]} lines={lines} j={hover} /></Tooltip>}
    </div>
  );
}

/** Rentabilidade acumulada (web): 280 px de altura, eixo Y fora do desenho, rótulos do X abaixo. */
export function WideLineChart({ labels, tips, lines }: LineProps) {
  const [ref, w] = useWidth<HTMLDivElement>();
  const n = labels.length;
  const [hover, on] = useHover((x, width) => clampIdx(Math.round((x / width) * (n - 1)), n));
  if (n < 2) return <p className="chart-empty">Ainda não há histórico suficiente para o gráfico.</p>;
  const all = lines.flatMap((l) => l.values);
  const ax = stepAxis(Math.min(0, ...all), Math.max(0, ...all));
  const X = (j: number) => (j / (n - 1)) * 800;
  const Y = (v: number) => 272 - ((v - ax.lo) / (ax.hi - ax.lo)) * 262;
  const tick = pctTick(ax.step);
  const ticks = ax.ticks.slice(0, 6);
  const plotW = Math.max(0, w - 48);
  return (
    <div ref={ref} className="wide-chart" style={{ paddingLeft: 48 }}>
      {ticks.map((t) => <span key={t} className="wide-ylabel" style={{ top: Y(t) - 8, width: 40 }}>{tick(t)}</span>)}
      <svg role="img" width="100%" height="280" viewBox="0 0 800 280" preserveAspectRatio="none" style={{ display: 'block' }} {...on}
        aria-label={`Gráfico de rentabilidade acumulada: ${lines.map((l) => `${l.label} ${pct(l.values[n - 1])}`).join(', ')}`}>
        {ticks.map((t) => <line key={t} x1={0} x2={800} y1={Y(t)} y2={Y(t)} stroke={Math.abs(t) < 1e-9 ? GRID_ZERO : GRID} vectorEffect="non-scaling-stroke" />)}
        <line x1={0} x2={800} y1={272} y2={272} stroke={AXIS} vectorEffect="non-scaling-stroke" />
        {[...lines].reverse().map((l) => (
          <polyline key={l.key} points={l.values.map((v, j) => `${X(j).toFixed(2)},${Y(v).toFixed(1)}`).join(' ')}
            fill="none" stroke={l.color} strokeWidth={l.width ?? 2} strokeDasharray={l.dashed ? '5 5' : undefined}
            strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
        ))}
        {hover != null && <line x1={X(hover)} x2={X(hover)} y1={10} y2={272} className="hover-line" vectorEffect="non-scaling-stroke" />}
      </svg>
      {hover != null && (
        <>
          {lines.map((l) => <span key={l.key} className="wide-dot" style={{ left: 48 + (hover / (n - 1)) * plotW, top: Y(l.values[hover]), background: l.color }} />)}
          <Tooltip x={48 + (hover / (n - 1)) * plotW} width={w}><LineTip title={tips[hover]} lines={lines} j={hover} /></Tooltip>
        </>
      )}
      <div className="wide-xlabels">
        {xTickIdx(n).map((j, k, ts) => <span key={j}>{k === ts.length - 1 ? 'hoje' : labels[j]}</span>)}
      </div>
    </div>
  );
}

/** Drawdown diário (queda desde o topo), como no protótipo: 0% no topo, y 8 → 120. */
export function DrawdownChart({ dates, tips, index, height = 148 }: { dates: string[]; tips: string[]; index: number[]; height?: number }) {
  const [ref, w] = useWidth<HTMLDivElement>();
  const n = index.length;
  const W = Math.max(w, 200);
  const L = 40, R = W, T = 8, B = 120;
  const [hover, on] = useHover((x) => clampIdx(Math.round(((x - L) / (R - L)) * (n - 1)), n));
  if (n < 2) return <p className="chart-empty">Ainda não há histórico suficiente para o gráfico.</p>;
  let peak = -Infinity;
  const dd = index.map((v) => { peak = Math.max(peak, v); return v / peak - 1; });
  const min = Math.min(...dd);
  let step = 0.5;
  for (const s of [0.005, 0.01, 0.02, 0.04, 0.05, 0.1, 0.2, 0.25, 0.5]) if (-min / s <= 2) { step = s; break; }
  const lo = -2 * step;
  const X = (j: number) => L + (j / (n - 1)) * (R - L);
  const Y = (v: number) => T + (v / lo) * (B - T);
  const pts = dd.map((v, j) => `${X(j).toFixed(1)},${Y(v).toFixed(1)}`).join(' ');
  const worst = dd.indexOf(min);
  const tick = (v: number) => pct(v, step < 0.01 ? 1 : 0, false);
  return (
    <div ref={ref} className="chart" style={{ height }}>
      {w > 0 && (
        <svg width={W} height={height} role="img" {...on}
          aria-label={`Gráfico de drawdown de ${monthLabel(dates[0].slice(0, 7))} a ${monthLabel(dates[n - 1].slice(0, 7))}, com queda máxima de ${pct(min)}`}>
          {[-step, lo].map((t) => <line key={t} x1={L} x2={R} y1={Y(t)} y2={Y(t)} stroke={GRID} />)}
          <polygon points={`${L},${T} ${pts} ${R},${T}`} fill="#F6D3CF" />
          <polyline points={pts} fill="none" stroke="#B42318" strokeWidth={1.5} strokeLinejoin="round" />
          <line x1={L} x2={R} y1={T} y2={T} stroke={AXIS} />
          <line x1={L} x2={L} y1={T} y2={B} stroke={AXIS} />
          {min < 0 && hover == null && <circle cx={X(worst)} cy={Y(min)} r={4} fill="#B42318" stroke="#fff" strokeWidth={2} />}
          {[0, -step, lo].map((t) => <text key={t} x={L - 5} y={Y(t) + 3.5} textAnchor="end" className="axis-label">{t === 0 ? '0%' : tick(t)}</text>)}
          {[0, Math.round((n - 1) / 2), n - 1].map((j, k) => (
            <text key={k} x={X(j)} y={B + 20.5} className="axis-label" textAnchor={k === 0 ? 'start' : k === 2 ? 'end' : 'middle'}>{monthLabel(dates[j].slice(0, 7))}</text>
          ))}
          {hover != null && (
            <>
              <line x1={X(hover)} x2={X(hover)} y1={T} y2={B} className="hover-line" />
              <circle cx={X(hover)} cy={Y(dd[hover])} r={3.5} fill="#B42318" stroke="#fff" strokeWidth={1.5} />
            </>
          )}
        </svg>
      )}
      {hover != null && (
        <Tooltip x={X(hover)} width={W}>
          <b>{tips[hover]}</b>
          <span className="tip-row">{dd[hover] < 0 ? `${pct(dd[hover])} desde o topo` : 'no topo'}</span>
        </Tooltip>
      )}
    </div>
  );
}

/** "50 mil", "1,5 mi" */
const money = (v: number) => (v === 0 ? '0' : v >= 1e6 ? `${(v / 1e6).toLocaleString('pt-BR')} mi` : `${(v / 1000).toLocaleString('pt-BR')} mil`);
const MONEY_STEPS = [100, 200, 250, 500, 1000, 2000, 2500, 5000, 10000, 20000, 25000, 50000, 100000, 200000, 250000, 500000, 1e6, 2e6, 2.5e6, 5e6, 1e7];

function moneyAxis(mx: number, maxSteps: number) {
  let step = MONEY_STEPS[MONEY_STEPS.length - 1];
  for (const s of MONEY_STEPS) if (mx / s <= maxSteps) { step = s; break; }
  return { hi: Math.max(step, Math.ceil(mx / step - 1e-9) * step), step };
}

function FlowTip({ f, color }: { f: MonthFlow; color: string }) {
  const gain = f.value - f.invested;
  return (
    <>
      <b>{monthLabel(f.month)}</b>
      <span className="tip-row"><i style={{ background: '#B9CBF4' }} />Aportado {brl0(f.invested)}</span>
      <span className="tip-row"><i style={{ background: gain < 0 ? '#B42318' : color }} />Rendimento {brl0(gain)}</span>
      <span className="tip-row">Patrimônio {brl0(f.value)}</span>
    </>
  );
}

/** Barras mensais: aportado (claro) + rendimento (cor) — ou perda (vermelho) quando o patrimônio fica abaixo do aportado. */
export function FlowsChart({ flows, color, height = 200 }: { flows: MonthFlow[]; color: string; height?: number }) {
  const [ref, w] = useWidth<HTMLDivElement>();
  const n = flows.length;
  const W = Math.max(w, 200);
  const L = 40, R = W - 6, T = 10, B = height - 28;
  const slot = (R - L) / Math.max(n, 1);
  const [hover, on] = useHover((x) => (x < L ? null : clampIdx(Math.floor((x - L) / slot), n)));
  if (!n) return <p className="chart-empty">Ainda não há meses completos para mostrar.</p>;
  const { hi, step } = moneyAxis(Math.max(...flows.map((f) => Math.max(f.value, f.invested)), 1), 5);
  const ticks: number[] = [];
  for (let v = hi; v >= 0; v -= step) ticks.push(v);
  const Y = (v: number) => B - (v / hi) * (B - T);
  const bw = Math.max(1, slot - 2);
  const xi = [0, Math.round((n - 1) / 3), Math.round((2 * (n - 1)) / 3), n - 1];
  return (
    <div ref={ref} className="chart" style={{ height }}>
      {w > 0 && (
        <svg width={W} height={height} role="img" {...on}
          aria-label={`Gráfico de barras mensais do patrimônio dividido entre valor aportado e rendimento, de ${monthLabel(flows[0].month)} a ${monthLabel(flows[n - 1].month)}`}>
          {ticks.filter((t) => t > 0).map((t) => <line key={t} x1={L} x2={R} y1={Y(t)} y2={Y(t)} stroke={GRID} />)}
          {flows.map((f, i) => {
            const x = L + i * slot + 1;
            const low = Math.min(f.invested, f.value);
            return (
              <g key={f.month} opacity={hover == null || hover === i ? 1 : 0.55}>
                <rect x={x} width={bw} y={Y(low)} height={Math.max(0, B - Y(low))} fill="#B9CBF4" />
                {f.value > f.invested && <rect x={x} width={bw} y={Y(f.value)} height={Y(f.invested) - Y(f.value)} fill={color} />}
                {f.value < f.invested && <rect x={x} width={bw} y={Y(f.invested)} height={Y(f.value) - Y(f.invested)} fill="#B42318" opacity={0.75} />}
              </g>
            );
          })}
          <line x1={L} x2={L} y1={T} y2={B} stroke={AXIS} />
          <line x1={L} x2={R} y1={B} y2={B} stroke={AXIS} />
          {ticks.map((t) => <text key={t} x={L - 5} y={Y(t) + 3.5} textAnchor="end" className="axis-label">{money(t)}</text>)}
          {[...new Set(xi)].map((i, k, all) => (
            <text key={i} x={k === 0 ? L : k === all.length - 1 ? R : L + (i + 0.5) * slot} y={B + 20} className="axis-label"
              textAnchor={k === 0 ? 'start' : k === all.length - 1 ? 'end' : 'middle'}>{monthLabel(flows[i].month)}</text>
          ))}
        </svg>
      )}
      {hover != null && <Tooltip x={L + (hover + 0.5) * slot} width={W}><FlowTip f={flows[hover]} color={color} /></Tooltip>}
    </div>
  );
}

/** Barras mensais (web): 180 px, escala em R$ com o topo, o meio e o zero. */
export function WideFlowsChart({ flows, color }: { flows: MonthFlow[]; color: string }) {
  const [ref, w] = useWidth<HTMLDivElement>();
  const n = flows.length;
  const [hover, on] = useHover((x, width) => clampIdx(Math.floor((x / width) * n), n));
  if (!n) return <p className="chart-empty">Ainda não há meses completos para mostrar.</p>;
  const { hi } = moneyAxis(Math.max(...flows.map((f) => Math.max(f.value, f.invested)), 1), 2);
  const Y = (v: number) => 176 - (v / hi) * 168;
  const slot = 800 / n;
  const bw = Math.max(1, slot - 4);
  // eixo de 48 px como no protótipo; cresce quando o rótulo é mais longo ("R$ 500 mil")
  const lw = Math.max(48, `R$ ${money(hi)}`.length * 6);
  const plotW = Math.max(0, w - lw - 8);
  return (
    <div ref={ref} className="wide-chart" style={{ paddingLeft: lw + 8 }}>
      <span className="wide-ylabel" style={{ top: 0, width: lw }}>R$ {money(hi)}</span>
      <span className="wide-ylabel" style={{ top: 84, width: lw }}>R$ {money(hi / 2)}</span>
      <span className="wide-ylabel" style={{ top: 168, width: lw }}>0</span>
      <svg role="img" width="100%" height="180" viewBox="0 0 800 180" preserveAspectRatio="none" style={{ display: 'block' }} {...on}
        aria-label={`Gráfico de barras mensais do patrimônio dividido entre valor aportado e rendimento, de ${monthLabel(flows[0].month)} a ${monthLabel(flows[n - 1].month)}`}>
        <line x1={0} x2={800} y1={8} y2={8} stroke={GRID} vectorEffect="non-scaling-stroke" />
        <line x1={0} x2={800} y1={92} y2={92} stroke={GRID} vectorEffect="non-scaling-stroke" />
        {flows.map((f, i) => {
          const x = i * slot + 2;
          const low = Math.min(f.invested, f.value);
          return (
            <g key={f.month} opacity={hover == null || hover === i ? 1 : 0.55}>
              <rect x={x} width={bw} y={Y(low)} height={Math.max(0, 176 - Y(low))} fill="#B9CBF4" />
              {f.value > f.invested && <rect x={x} width={bw} y={Y(f.value)} height={Y(f.invested) - Y(f.value)} fill={color} />}
              {f.value < f.invested && <rect x={x} width={bw} y={Y(f.invested)} height={Y(f.value) - Y(f.invested)} fill="#B42318" opacity={0.75} />}
            </g>
          );
        })}
        <line x1={0} x2={800} y1={176} y2={176} stroke={AXIS} vectorEffect="non-scaling-stroke" />
      </svg>
      {hover != null && <Tooltip x={lw + 8 + ((hover + 0.5) / n) * plotW} width={w}><FlowTip f={flows[hover]} color={color} /></Tooltip>}
      <div className="wide-xlabels">
        {[...new Set([0, Math.round((n - 1) / 3), Math.round((2 * (n - 1)) / 3), n - 1])].map((i) => <span key={i}>{monthLabel(flows[i].month)}</span>)}
      </div>
    </div>
  );
}
