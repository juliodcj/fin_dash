import { useState } from 'react';
import { ReturnCard } from '../components/returns';
import { Icon, useWide } from '../components/ui';
import { classOf } from '../lib/assets';
import { brl, brlSigned, pct, tone } from '../lib/format';
import type { Period } from '../lib/types';
import { href } from '../router';
import { useApp, useMoney } from '../state';
import { classAlloc, classColor, usePortfolio, useSubject } from '../useData';
import { EyeButton, ratesText, StatusLine } from './common';
import { Painel } from './Painel';

export function Carteira() {
  const { trades, settings, market, loadSample } = useApp();
  const money = useMoney();
  const p = usePortfolio();
  const subject = useSubject();
  const [period, setPeriod] = useState<Period>(settings.defaultPeriod);
  const alloc = classAlloc(p.holdings, settings);
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
        <span className="label">
          Patrimônio
          <EyeButton />
        </span>
        <span className="hero-value">{money(brl(p.total))}</span>
        <div className={`today ${tone(p.today)}`}>
          <span className="chip">{p.today < 0 ? Icon.arrowDown(12) : Icon.arrowUp(12)}{pct(p.todayPct)} hoje</span>
          <span>{money(brlSigned(p.today))}</span>
        </div>
        <div className="duo">
          <div className="tile white">
            <span className="tile-label">Total investido</span>
            <span className="tile-value">{money(brl(p.invested))}</span>
          </div>
          <div className="tile white">
            <span className="tile-label">Lucro</span>
            <span className={`tile-value ${tone(p.profit)}`}>{money(brlSigned(p.profit))}</span>
          </div>
        </div>
      </section>

      <div className="home-main">
        {subject ? (
          <ReturnCard subject={subject} label="Carteira" color="var(--accent)" period={period} onPeriod={setPeriod} annualize={settings.annualize} method={settings.method} variant="portfolio" />
        ) : (
          <section className="card"><p className="muted">Aguardando cotações para calcular a rentabilidade…</p></section>
        )}
      </div>

      <section className="assets home-side">
        <div className="section-head">
          <h2>Ativos</h2>
          <span className="muted small">{hasTargets ? 'alocação por classe · alvo' : 'alocação por classe'}</span>
        </div>
        {p.holdings.length > 0 && (
          <>
            <div className="alloc-bar" aria-hidden="true">
              {alloc.filter((c) => c.value > 0).map((c) => <span key={c.name} style={{ flexGrow: c.weight, background: classColor(c.name) }} />)}
            </div>
            <ul className="class-list">
              {alloc.map((c) => (
                <li key={c.name}>
                  <i style={{ background: classColor(c.name) }} />
                  <span>{c.name}</span>
                  <b>{pct(c.weight, 1, false)}</b>
                  {c.target != null && <span className={`muted${Math.abs(c.weight - c.target) >= 0.05 ? ' off' : ''}`}>alvo {pct(c.target, 0, false)}</span>}
                </li>
              ))}
            </ul>
          </>
        )}
        <div className="list">
          {p.holdings.map((h) => {
            const cls = classOf(h.ticker, settings.classes, h.name);
            return (
              <a key={h.ticker} href={href.ativo(h.ticker)} className="row">
                <span className="stripe" style={{ background: classColor(cls) }} />
                <span className="row-main">
                  <span className="row-title">{h.ticker}</span>
                  <span className="row-sub">{cls} · {pct(h.weight, 1, false)}</span>
                </span>
                <span className="row-end">
                  <span className="row-value">{money(brl(h.value))}</span>
                  <span className={`row-sub strong ${tone(h.result)}`}>{pct(h.result)}</span>
                </span>
                <span className="chev">{Icon.chevron(16)}</span>
              </a>
            );
          })}
          {p.holdings.length === 0 && <p className="muted pad">Nenhuma posição aberta.</p>}
        </div>
        <p className="footnote">
          {settings.demo ? 'Dados de demonstração (simulados)' : `Cotações: Yahoo Finance (último fechamento) · CDI: Ipeadata · IPCA: IBGE${ratesText(market) ? ` · ${ratesText(market)}` : ''}`} · {settings.method === 'mwrr' ? 'rentabilidade ponderada pelo dinheiro (MWRR)' : 'rentabilidade por cotas (TWR)'}, sem IR
        </p>
      </section>
    </div>
  );
}

function RefreshButton() {
  const { refresh, loading } = useApp();
  return (
    <button type="button" className="icon-btn" aria-label="Atualizar cotações" onClick={refresh} disabled={loading}>
      <span className={`icon-box${loading ? ' spin' : ''}`}>{Icon.refresh(18)}</span>
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
