import { useEffect, useState, type ReactNode } from 'react';
import { PERIODS } from '../lib/finance';
import type { Period } from '../lib/types';
import { href, type Route } from '../router';

const svg = (d: ReactNode, size = 22) => (
  <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">{d}</svg>
);

export const Icon = {
  home: (s?: number) => svg(<path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" />, s),
  chart: (s?: number) => svg(<><path d="M4 20V10" /><path d="M10 20V4" /><path d="M16 20v-7" /><path d="M22 20H2" /></>, s),
  plus: (s?: number) => svg(<><circle cx="12" cy="12" r="9" /><path d="M12 8v8" /><path d="M8 12h8" /></>, s),
  add: (s?: number) => svg(<><path d="M12 5v14" /><path d="M5 12h14" /></>, s),
  sliders: (s?: number) => svg(<><path d="M4 7h10" /><path d="M18 7h2" /><circle cx="16" cy="7" r="2" /><path d="M4 17h2" /><path d="M10 17h10" /><circle cx="8" cy="17" r="2" /></>, s),
  refresh: (s?: number) => svg(<><path d="M21 12a9 9 0 1 1-2.64-6.36" /><path d="M21 3v6h-6" /></>, s),
  back: (s?: number) => svg(<path d="M15 6l-6 6 6 6" />, s),
  close: (s?: number) => svg(<><path d="M6 6l12 12" /><path d="M18 6L6 18" /></>, s),
  chevron: (s?: number) => svg(<path d="M9 6l6 6-6 6" />, s),
  down: (s?: number) => svg(<path d="M6 9l6 6 6-6" />, s),
  arrowUp: (s?: number) => <svg aria-hidden="true" width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round"><path d="M12 19V5" /><path d="M5 12l7-7 7 7" /></svg>,
  arrowDown: (s?: number) => <svg aria-hidden="true" width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14" /><path d="M19 12l-7 7-7-7" /></svg>,
  trend: (s?: number) => svg(<path d="M3 17l6-6 4 4 8-8" />, s),
  pie: (s?: number) => svg(<><circle cx="12" cy="12" r="9" /><path d="M12 3v9l6 4" /></>, s),
  list: (s?: number) => svg(<><path d="M8 6h13" /><path d="M8 12h13" /><path d="M8 18h13" /><path d="M3 6h.01" /><path d="M3 12h.01" /><path d="M3 18h.01" /></>, s),
  trash: (s?: number) => svg(<><path d="M4 7h16" /><path d="M10 11v6" /><path d="M14 11v6" /><path d="M6 7l1 13h10l1-13" /><path d="M9 7V4h6v3" /></>, s),
};

export function PeriodPicker({ value, onChange, light, wide }: { value: Period; onChange: (p: Period) => void; light?: boolean; wide?: boolean }) {
  return (
    <div role="group" aria-label="Período" className={wide ? 'chips' : `segmented${light ? ' light' : ''}`}>
      {PERIODS.map((p) => (
        <button key={p.id} type="button" aria-pressed={p.id === value} onClick={() => onChange(p.id)}>{p.label}</button>
      ))}
    </div>
  );
}

export function Toggle({ id, checked, onChange, label, hint }: { id: string; checked: boolean; onChange: (v: boolean) => void; label: string; hint?: string }) {
  return (
    <label className="toggle-row" htmlFor={id}>
      <span className="toggle-text">
        <span className="toggle-label">{label}</span>
        {hint && <span className="hint">{hint}</span>}
      </span>
      <input id={id} type="checkbox" role="switch" className="switch" checked={checked} onChange={(e) => onChange(e.target.checked)} />
    </label>
  );
}

const NAV = [
  { key: 'home', label: 'Carteira', href: href.home, icon: Icon.home },
  { key: 'analise', label: 'Análise', href: href.analise, icon: Icon.chart },
  { key: 'lancar', label: 'Lançar', href: href.lancar(), icon: Icon.plus },
  { key: 'ajustes', label: 'Ajustes', href: href.ajustes, icon: Icon.sliders },
] as const;

const activeKey = (r: Route) => (r.name === 'ativo' ? 'home' : r.name);

export function TabBar({ route }: { route: Route }) {
  return (
    <nav aria-label="Navegação principal" className="tabbar">
      {NAV.map((n) => (
        <a key={n.key} href={n.href} aria-current={activeKey(route) === n.key ? 'page' : undefined}>
          {n.icon()}
          {n.label}
        </a>
      ))}
    </nav>
  );
}

/** itens da barra lateral do painel web, como no protótipo (Ativos e Lançamentos levam à tabela de ativos) */
const SIDE = [
  { key: 'home', label: 'Carteira', href: href.home, icon: Icon.home },
  { key: 'analise', label: 'Análise', href: href.analise, icon: Icon.chart },
  { key: 'ativos', label: 'Ativos', href: '#ativos', icon: Icon.pie },
  { key: 'lancamentos', label: 'Lançamentos', href: '#ativos', icon: Icon.list },
] as const;

export function Sidebar({ route }: { route: Route }) {
  const key = route.name === 'ativo' ? 'ativos' : route.name;
  return (
    <aside className="sidebar">
      <div className="brand">
        <span className="brand-mark" aria-hidden="true">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round"><path d="M3 17l6-6 4 4 8-8" /></svg>
        </span>
        Fin Dash
      </div>
      <nav aria-label="Navegação principal">
        {SIDE.map((n) => (
          <a key={n.key} href={n.href} aria-current={key === n.key ? 'page' : undefined}>
            {n.icon(18)}
            {n.label}
          </a>
        ))}
      </nav>
      <a className="side-cta" href={href.lancar()}>+ Novo lançamento</a>
      {/* Ajustes não aparece no protótipo web; fica discreto no rodapé da barra */}
      <a className="side-foot" href={href.ajustes} aria-current={route.name === 'ajustes' ? 'page' : undefined}>{Icon.sliders(16)}Ajustes</a>
    </aside>
  );
}

export function Legend({ color, dashed, children }: { color: string; dashed?: boolean; children: ReactNode }) {
  return (
    <span className="legend">
      <i className={dashed ? 'dashed' : ''} style={dashed ? { borderColor: color } : { background: color }} />
      {children}
    </span>
  );
}

/** tela larga (PC): o layout do painel web do protótipo */
export function useWide() {
  const q = '(min-width: 1024px)';
  const [wide, setWide] = useState(() => typeof matchMedia === 'function' && matchMedia(q).matches);
  useEffect(() => {
    const m = matchMedia(q);
    const on = () => setWide(m.matches);
    m.addEventListener('change', on);
    return () => m.removeEventListener('change', on);
  }, []);
  return wide;
}
