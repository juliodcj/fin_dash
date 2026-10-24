import { Icon } from '../components/ui';
import { dateBR, monthLabel, todayISO, toISO } from '../lib/dates';
import { issueText } from '../lib/quality';
import type { Market } from '../lib/types';
import { useApp } from '../state';

/** pregão regular da B3 (dias úteis, 10h–18h em Brasília); feriados não são considerados */
function b3Open(now: Date) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', { timeZone: 'America/Sao_Paulo', weekday: 'short', hour: 'numeric', hourCycle: 'h23' })
      .formatToParts(now).map((x) => [x.type, x.value]),
  );
  const h = Number(p.hour);
  return p.weekday !== 'Sat' && p.weekday !== 'Sun' && h >= 10 && h < 18;
}

/** até que data vai cada dado: último pregão com cotação, último CDI diário e último IPCA divulgado */
export function dataDates(market: Market) {
  const last = Object.values(market.prices).map((q) => q.points[q.points.length - 1]?.date).filter(Boolean).sort();
  return {
    quotes: last[last.length - 1] ?? null,
    cdi: market.cdi[market.cdi.length - 1]?.date ?? null,
    ipca: market.ipca[market.ipca.length - 1]?.month ?? null,
  };
}

/** "CDI até 15/10/2026 · IPCA até set/26" */
export function ratesText(market: Market) {
  const d = dataDates(market);
  return [d.cdi && `CDI até ${dateBR(d.cdi)}`, d.ipca && `IPCA até ${monthLabel(d.ipca)}`].filter(Boolean).join(' · ');
}

/**
 * Celular: "Cotações de 16/10 · atualizado 17:05" (cabe numa linha).
 * Painel web (withRates): "Atualizado hoje, 17:05 · cotações até 16/10 · CDI até … · B3 fechada".
 */
export function statusText(market: Market, demo: boolean, withRates = false) {
  if (!market.updatedAt) return '';
  const t = new Date(market.updatedAt);
  const hm = t.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  const isToday = toISO(t) === todayISO();
  const q = dataDates(market).quotes;
  const qd = q && dateBR(q).slice(0, q.slice(0, 4) === todayISO().slice(0, 4) ? 5 : 10);
  if (!withRates) {
    const at = isToday ? hm : `${t.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })} ${hm}`;
    return [demo ? 'Demonstração' : qd && `Cotações de ${qd}`, `atualizado ${at}`].filter(Boolean).join(' · ');
  }
  return [
    `Atualizado ${isToday ? 'hoje' : t.toLocaleDateString('pt-BR')}, ${hm}`,
    qd && `cotações até ${qd}`,
    ratesText(market),
    demo ? 'demonstração' : b3Open(new Date()) ? 'B3 aberta' : 'B3 fechada',
  ].filter(Boolean).join(' · ');
}

export function StatusLine({ className = 'muted small', withRates = false }: { className?: string; withRates?: boolean }) {
  const { market, loading, settings } = useApp();
  return (
    <>
      <span className={className}>{loading ? 'Atualizando cotações…' : statusText(market, settings.demo, withRates)}</span>
      {!loading && market.errors.length > 0 && (
        <details className="errors">
          <summary>{market.errors.length === 1 ? '1 aviso' : `${market.errors.length} avisos`} ao buscar dados</summary>
          <ul>{market.errors.map((e) => <li key={e}>{e}</li>)}</ul>
        </details>
      )}
      <QuoteIssues />
    </>
  );
}

/** erros encontrados nas cotações; com `ticker`, só os daquele ativo */
export function QuoteIssues({ ticker }: { ticker?: string }) {
  const { market, loading } = useApp();
  const list = market.issues.filter((x) => !ticker || x.ticker === ticker);
  if (loading || !list.length) return null;
  return (
    <details className="errors">
      <summary>{list.length === 1 ? '1 erro' : `${list.length} erros`} nas cotações{ticker ? '' : ` de ${[...new Set(list.map((x) => x.ticker))].join(', ')}`}</summary>
      <ul>{list.map((x) => <li key={`${x.ticker}${x.kind}${x.from}`}>{issueText(x)}</li>)}</ul>
    </details>
  );
}

/** olho ao lado do patrimônio: oculta ou mostra os valores em R$ da tela inicial */
export function EyeButton({ size = 18 }: { size?: number }) {
  const { settings, updateSettings } = useApp();
  const hidden = settings.hideValues;
  return (
    <button type="button" className="eye-btn" aria-pressed={hidden} aria-label={hidden ? 'Mostrar valores' : 'Ocultar valores'}
      onClick={() => updateSettings({ hideValues: !hidden })}>
      {hidden ? Icon.eyeOff(size) : Icon.eye(size)}
    </button>
  );
}
