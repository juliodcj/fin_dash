import { todayISO, toISO } from '../lib/dates';
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

/** "Atualizado hoje, 17:05 · B3 fechada" */
export function statusText(updatedAt: string | null, demo: boolean) {
  if (!updatedAt) return '';
  const t = new Date(updatedAt);
  const hm = t.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  const day = toISO(t) === todayISO() ? 'hoje' : t.toLocaleDateString('pt-BR');
  return `Atualizado ${day}, ${hm} · ${demo ? 'demonstração' : b3Open(new Date()) ? 'B3 aberta' : 'B3 fechada'}`;
}

export function StatusLine({ className = 'muted small' }: { className?: string }) {
  const { market, loading, settings } = useApp();
  return (
    <>
      <span className={className}>{loading ? 'Atualizando cotações…' : statusText(market.updatedAt, settings.demo)}</span>
      {!loading && market.errors.length > 0 && (
        <details className="errors">
          <summary>{market.errors.length === 1 ? '1 aviso' : `${market.errors.length} avisos`} ao buscar dados</summary>
          <ul>{market.errors.map((e) => <li key={e}>{e}</li>)}</ul>
        </details>
      )}
    </>
  );
}
