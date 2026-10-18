import { useState } from 'react';
import { ReturnCard } from '../components/returns';
import { Icon } from '../components/ui';
import { describe } from '../lib/assets';
import { dateBR } from '../lib/dates';
import { brl, brlSigned, pct, qty, tone } from '../lib/format';
import type { Period } from '../lib/types';
import { href } from '../router';
import { useApp } from '../state';
import { colorFor, usePortfolio, useSubject } from '../useData';
import { QuoteIssues } from './common';

const SHOW = 3;

export function Ativo({ ticker }: { ticker: string }) {
  const { trades, settings, market, deleteTrade } = useApp();
  const p = usePortfolio();
  const subject = useSubject(ticker);
  const [period, setPeriod] = useState<Period>(settings.defaultPeriod);
  const [all, setAll] = useState(false);

  const own = trades.filter((t) => t.ticker === ticker).sort((a, b) => (a.date < b.date ? 1 : -1));
  const pos = p.positions[ticker];
  const h = p.holdings.find((x) => x.ticker === ticker);
  const quote = market.prices[ticker];
  const price = quote?.price ?? pos?.avgPrice ?? 0;
  const value = (pos?.qty ?? 0) * price;
  const cost = (pos?.qty ?? 0) * (pos?.avgPrice ?? 0);
  const income = p.income.find((x) => x.ticker === ticker)?.value ?? 0;
  const totalIncome = p.income.reduce((a, x) => a + x.value, 0);
  const tickers = p.holdings.map((x) => x.ticker);

  if (!own.length) {
    return (
      <div className="screen">
        <BackHeader title={ticker} sub="Nenhum lançamento deste ativo" />
        <section className="card"><a className="btn" href={href.lancar(ticker)}>Lançar compra de {ticker}</a></section>
      </div>
    );
  }

  const shown = all ? own : own.slice(0, SHOW);

  return (
    <div className="screen asset">
      <BackHeader title={ticker} sub={`${describe(ticker, quote?.name)} · ${h ? `${pct(h.weight, 1, false)} da carteira` : 'posição zerada'}`} />

      <section className="hero">
        <span className="label">Cotação</span>
        <div className="quote">
          <span className="hero-value">{brl(price)}</span>
          {quote?.changePct != null && <span className={`strong ${tone(quote.changePct)}`}>{pct(quote.changePct)} hoje</span>}
        </div>
        <QuoteIssues ticker={ticker} />
      </section>

      <div className="asset-grid">
        <section className="card">
          <h2>Minha posição</h2>
          <div className="grid2">
            <div className="kv"><span>Quantidade</span><b>{qty(pos?.qty ?? 0)} cotas</b></div>
            <div className="kv"><span>Preço médio</span><b>{brl(pos?.avgPrice ?? 0)}</b></div>
            <div className="kv"><span>Investido</span><b>{brl(cost)}</b></div>
            <div className="kv"><span>Valor atual</span><b>{brl(value)}</b></div>
          </div>
          <div className="kv-line">
            <span>Resultado</span>
            <b className={tone(value - cost)}>{brlSigned(value - cost)} · {pct(cost > 0 ? value / cost - 1 : 0)}</b>
          </div>
          {pos && pos.realized !== 0 && (
            <div className="kv-line"><span>Lucro realizado em vendas</span><b className={tone(pos.realized)}>{brlSigned(pos.realized)}</b></div>
          )}
          {totalIncome > 0 && income > 0 && <p className="muted small">Responsável por {pct(income / totalIncome, 0, false)} do lucro da carteira.</p>}
        </section>

        {subject ? (
          <ReturnCard subject={subject} label={ticker} color={colorFor(ticker, tickers.length ? tickers : [ticker])} period={period} onPeriod={setPeriod} annualize={settings.annualize} method={settings.method} variant="asset" />
        ) : (
          <section className="card"><p className="muted">Sem cotações de {ticker} para calcular a rentabilidade.</p></section>
        )}

        <section className="trades">
          <div className="section-head">
            <h2>Lançamentos</h2>
            <a className="text-btn" href={href.lancar(ticker)}>{Icon.add(16)}Novo</a>
          </div>
          <div className="list">
            {shown.map((t) => (
              // tocar no lançamento oferece a exclusão (o protótipo não tem botão de lixeira)
              <button
                key={t.id}
                type="button"
                className="row trade"
                title="Excluir lançamento"
                onClick={() => { if (confirm(`Excluir ${t.side === 'buy' ? 'compra' : 'venda'} de ${qty(t.qty)} ${ticker} em ${dateBR(t.date)}?`)) deleteTrade(t.id); }}
              >
                <span className="row-main">
                  <span className="row-title small-title">{t.side === 'buy' ? 'Compra' : 'Venda'} · {qty(t.qty)} {t.qty === 1 ? 'cota' : 'cotas'}</span>
                  <span className="row-sub">{dateBR(t.date)} · {brl(t.price)}{t.fees ? ` · custos ${brl(t.fees)}` : ''}</span>
                </span>
                <span className="row-value">{brl(t.qty * t.price + (t.side === 'buy' ? t.fees : -t.fees))}</span>
              </button>
            ))}
            {own.length > SHOW && (
              <button type="button" className="list-more" onClick={() => setAll(!all)}>
                {all ? 'Mostrar menos' : `Ver todos os ${own.length} lançamentos`}
              </button>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

function BackHeader({ title, sub }: { title: string; sub: string }) {
  return (
    <header className="back-head">
      <a href={href.home} className="icon-btn plain" aria-label="Voltar para a carteira">{Icon.back()}</a>
      <div>
        <h1>{title}</h1>
        <span className="muted small ellipsis">{sub}</span>
      </div>
    </header>
  );
}
