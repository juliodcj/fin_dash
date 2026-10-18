import { useApp } from '../state';

export function StatusLine() {
  const { market, loading, settings } = useApp();
  let text: string;
  if (loading) text = 'Atualizando cotações…';
  else if (market.updatedAt) {
    const t = new Date(market.updatedAt);
    text = `Atualizado às ${t.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}${settings.demo ? ' · demonstração' : ''}`;
  } else text = '';
  return (
    <>
      <span className="muted small">{text}</span>
      {!loading && market.errors.length > 0 && (
        <details className="errors">
          <summary>{market.errors.length === 1 ? '1 aviso' : `${market.errors.length} avisos`} ao buscar dados</summary>
          <ul>{market.errors.map((e) => <li key={e}>{e}</li>)}</ul>
        </details>
      )}
    </>
  );
}
