import { useState } from 'react';
import { ReturnCard } from '../components/returns';
import { Icon, useWide } from '../components/ui';
import { brl, brlSigned, pct, tone } from '../lib/format';
import type { Period } from '../lib/types';
import { href } from '../router';
import { useApp } from '../state';
import { colorFor, usePortfolio, useSubject } from '../useData';
import { StatusLine } from './common';
import { Painel } from './Painel';

export function Carteira() {
  const { trades, settings, loadSample } = useApp();
  const p = usePortfolio();
  const subject = useSubject();
  const [period, setPeriod] = useState<Period>(settings.defaultPeriod);
  const tickers = p.holdings.map((h) => h.ticker);
  const hasTargets = Object.keys(settings.targets).length > 0;
  const wide = useWide();

  if (!trades.length) return <Empty onSample={loadSample} />;
  if (wide) return <Painel />;

  return (
    <div className="screen home">
      <header className="screen-head">
        <div>
          <h1>Minha carteira</h1>
          <StatusLine />
        </div>
        <RefreshButton />
      </header>

      <section className="hero">
        <span className="label">Patrimônio</span>
        <span className="hero-value">{brl(p.total)}</span>
        <div className={`today ${tone(p.today)}`}>
          <span className="chip">{p.today < 0 ? Icon.arrowDown(12) : Icon.arrowUp(12)}{pct(p.todayPct)} hoje</span>
          <span>{brlSigned(p.today)}</span>
        </div>
        <div className="duo">
          <div className="tile white">
            <span className="tile-label">Total investido</span>
            <span className="tile-value">{brl(p.invested)}</span>
          </div>
          <div className="tile white">
            <span className="tile-label">Lucro</span>
            <span className={`tile-value ${tone(p.profit)}`}>{brlSigned(p.profit)}</span>
          </div>
        </div>
      </section>

      <div className="home-main">
        {subject ? (
          <ReturnCard subject={subject} label="Carteira" color="var(--accent)" period={period} onPeriod={setPeriod} annualize={settings.annualize} variant="portfolio" />
        ) : (
          <section className="card"><p className="muted">Aguardando cotações para calcular a rentabilidade…</p></section>
        )}
      </div>

      <section className="assets home-side">
        <div className="section-head">
          <h2>Ativos</h2>
          <span className="muted small">{hasTargets ? 'alocação atual · alvo' : 'alocação atual'}</span>
        </div>
        {p.holdings.length > 0 && (
          <div className="alloc-bar" aria-hidden="true">
            {p.holdings.map((h) => <span key={h.ticker} style={{ flexGrow: h.weight, background: colorFor(h.ticker, tickers) }} />)}
          </div>
        )}
        <div className="list">
          {p.holdings.map((h) => {
            const target = settings.targets[h.ticker];
            return (
              <a key={h.ticker} href={href.ativo(h.ticker)} className="row">
                <span className="stripe" style={{ background: colorFor(h.ticker, tickers) }} />
                <span className="row-main">
                  <span className="row-title">{h.ticker}</span>
                  <span className="row-sub">{pct(h.weight, 1, false)}{target != null ? ` · alvo ${pct(target, 0, false)}` : ''}</span>
                </span>
                <span className="row-end">
                  <span className="row-value">{brl(h.value)}</span>
                  <span className={`row-sub strong ${tone(h.result)}`}>{pct(h.result)}</span>
                </span>
                <span className="chev">{Icon.chevron(16)}</span>
              </a>
            );
          })}
          {p.holdings.length === 0 && <p className="muted pad">Nenhuma posição aberta.</p>}
        </div>
        <p className="footnote">
          {settings.demo ? 'Dados de demonstração (simulados)' : 'Cotações: Yahoo Finance (último fechamento) · CDI: Ipeadata · IPCA: IBGE'} · rentabilidade por cotas (TWR), sem IR
        </p>
      </section>
    </div>
  );
}

function RefreshButton() {
  const { refresh, loading } = useApp();
  return (
    <button type="button" className="icon-btn" aria-label="Atualizar cotações" onClick={refresh} disabled={loading}>
      <span className={loading ? 'spin' : ''}>{Icon.refresh(18)}</span>
    </button>
  );
}

function Empty({ onSample }: { onSample: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  return (
    <div className="screen">
      <header className="screen-head"><div><h1>Minha carteira</h1></div></header>
      <section className="card empty">
        <h2>Comece pela sua primeira compra</h2>
        <p className="muted">Cadastre ticker, data, quantidade e preço. O app busca as cotações e calcula a rentabilidade contra CDI e IPCA.</p>
        <a className="btn" href={href.lancar()}>Novo lançamento</a>
        <button
          type="button"
          className="btn ghost"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setErr('');
            try { await onSample(); } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
          }}
        >
          {busy ? 'Carregando…' : 'Carregar carteira exemplo (70% WRLD11 · 30% B5P211)'}
        </button>
        {err && <p className="error" role="alert">{err}</p>}
      </section>
    </div>
  );
}
