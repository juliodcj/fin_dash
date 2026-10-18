import { useEffect, useState, type FormEvent, type KeyboardEvent } from 'react';
import { Icon } from '../components/ui';
import { fetchQuote } from '../lib/api';
import { describe } from '../lib/assets';
import { brToISO, dateBR, todayISO, toISO } from '../lib/dates';
import { demoQuote } from '../lib/demo';
import { qtyAt } from '../lib/finance';
import { brl, parseNumberBR, qty as fmtQty } from '../lib/format';
import type { PriceHistory, Side } from '../lib/types';
import { href, navigate } from '../router';
import { useApp } from '../state';

// raiz de 4 caracteres (pode ter dígitos, ex.: B5P211) + número da classe
const TICKER_RE = /^[A-Z][A-Z0-9]{3}\d{1,2}F?$/;

/** máscara dd/mm/aaaa enquanto digita */
function maskDate(s: string) {
  const d = s.replace(/\D/g, '').slice(0, 8);
  return [d.slice(0, 2), d.slice(2, 4), d.slice(4)].filter(Boolean).join('/');
}

/** fechamento no dia escolhido (ou no último pregão antes dele) */
function closeOn(q: PriceHistory | undefined, iso: string) {
  if (!q) return null;
  let p = null;
  for (const x of q.points) if (x.date <= iso) p = x; else break;
  return p;
}

export function Lancamento({ initialTicker }: { initialTicker?: string }) {
  const { trades, addTrade, market, settings } = useApp();
  const known = [...new Set(trades.map((t) => t.ticker))].sort();
  const [side, setSide] = useState<Side>('buy');
  const [ticker, setTicker] = useState(initialTicker ?? '');
  const [dateText, setDateText] = useState(dateBR(todayISO()));
  const [qtyText, setQtyText] = useState('');
  const [priceText, setPriceText] = useState('');
  const [priceTouched, setPriceTouched] = useState(false);
  const [showFees, setShowFees] = useState(false);
  const [feesText, setFeesText] = useState('');
  const [tried, setTried] = useState(false);
  const [focus, setFocus] = useState(false);
  const [active, setActive] = useState(0);
  const [extra, setExtra] = useState<Record<string, PriceHistory>>({});

  const t = ticker.trim().toUpperCase();
  const date = /^\d{2}\/\d{2}\/\d{4}$/.test(dateText) ? brToISO(dateText) : '';
  // rejeita datas inexistentes (31/02 etc.)
  const validDate = !!date && toISO(new Date(`${date}T12:00:00`)) === date;
  const q = parseNumberBR(qtyText);
  const price = parseNumberBR(priceText);
  const fees = feesText.trim() ? parseNumberBR(feesText) : 0;
  const held = t && validDate ? qtyAt(trades, t, date) : 0;

  // cotação do ativo para sugerir o preço: a da carteira ou buscada na hora
  const base = t.replace(/F$/, '');
  const quote = market.prices[base] ?? extra[base];
  useEffect(() => {
    if (!TICKER_RE.test(t) || market.prices[base] || extra[base]) return;
    let off = false;
    (settings.demo ? Promise.resolve(demoQuote(base)) : fetchQuote(base))
      .then((r) => { if (!off) setExtra((m) => ({ ...m, [base]: r })); })
      .catch(() => {});
    return () => { off = true; };
  }, [t, base, market.prices, extra, settings.demo]);
  const close = validDate ? closeOn(quote, date) : null;
  useEffect(() => {
    if (!priceTouched) setPriceText(close ? brl(close.close) : '');
  }, [close?.date, close?.close, priceTouched]);

  // sugestões: ativos da carteira que começam com o que foi digitado, e o fracionário
  const suggestions = t
    ? known.filter((k) => k.startsWith(t.replace(/F$/, '')) && k !== t).flatMap((k) => [
        { ticker: k, sub: describe(k, market.prices[k]?.name), price: market.prices[k]?.price },
        { ticker: `${k}F`, sub: 'mercado fracionário', price: market.prices[k]?.price },
      ]).filter((s) => s.ticker !== t)
    : [];
  const open = focus && suggestions.length > 0;
  const pick = (k: string) => { setTicker(k); setFocus(false); setActive(0); };
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (!open) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => (a + 1) % suggestions.length); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => (a - 1 + suggestions.length) % suggestions.length); }
    else if (e.key === 'Enter') { e.preventDefault(); pick(suggestions[Math.min(active, suggestions.length - 1)].ticker); }
    else if (e.key === 'Escape') setFocus(false);
  };

  const errors: Record<string, string> = {};
  if (!TICKER_RE.test(t)) errors.ticker = 'Use o código da B3, ex.: WRLD11, PETR4.';
  if (!validDate || date > todayISO()) errors.date = 'Informe uma data até hoje (dd/mm/aaaa).';
  if (!(q > 0) || !Number.isInteger(q)) errors.qty = 'Quantidade inteira maior que zero.';
  else if (side === 'sell' && q > held) errors.qty = `Você tinha ${fmtQty(held)} cotas de ${t} nessa data.`;
  if (!(price > 0)) errors.price = 'Informe o preço pago por cota.';
  if (!(fees >= 0)) errors.fees = 'Valor inválido.';
  const valid = Object.keys(errors).length === 0;
  const total = q > 0 && price > 0 ? q * price + (side === 'buy' ? fees || 0 : -(fees || 0)) : 0;
  const err = (k: string) => (tried && errors[k] ? <span className="field-error" id={`${k}-err`}>{errors[k]}</span> : null);
  const fromClose = !!close && !priceTouched;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setTried(true);
    if (!valid) return;
    addTrade({ ticker: t, side, date, qty: q, price, fees: fees || 0 });
    navigate(href.ativo(t));
  };

  return (
    <div className="screen form-screen">
      <header className="modal-head">
        <a href={href.home} className="icon-btn plain" aria-label="Fechar">{Icon.close()}</a>
        <h1>Novo lançamento</h1>
        <span />
      </header>

      <form id="trade" className="form" onSubmit={submit} noValidate>
        <div role="group" aria-label="Tipo de operação" className="segmented two">
          <button type="button" aria-pressed={side === 'buy'} onClick={() => setSide('buy')}>Compra</button>
          <button type="button" aria-pressed={side === 'sell'} onClick={() => setSide('sell')}>Venda</button>
        </div>

        <div className="field">
          <label htmlFor="tk">Ticker</label>
          <input
            id="tk"
            value={ticker}
            onChange={(e) => { setTicker(e.target.value.toUpperCase()); setActive(0); setFocus(true); }}
            onFocus={() => setFocus(true)}
            onBlur={() => setFocus(false)}
            onKeyDown={onKey}
            role="combobox"
            aria-expanded={open}
            aria-controls="tk-list"
            aria-autocomplete="list"
            aria-activedescendant={open ? `tk-opt-${active}` : undefined}
            autoComplete="off"
            autoCapitalize="characters"
            placeholder="Ex.: WRLD11"
            aria-invalid={tried && !!errors.ticker}
            aria-describedby="ticker-err"
          />
          {open && (
            <ul id="tk-list" role="listbox" aria-label="Sugestões" className="suggest">
              {suggestions.map((s, i) => (
                <li
                  key={s.ticker}
                  id={`tk-opt-${i}`}
                  role="option"
                  aria-selected={i === active}
                  onMouseDown={(e) => { e.preventDefault(); pick(s.ticker); }}
                >
                  <span className="suggest-main"><b>{s.ticker}</b><span>{s.sub}</span></span>
                  {s.price != null && <span className="suggest-price">{brl(s.price)}</span>}
                </li>
              ))}
            </ul>
          )}
          {err('ticker')}
        </div>

        <div className="grid2">
          <div className="field">
            <label htmlFor="dt">Data</label>
            <input id="dt" inputMode="numeric" value={dateText} onChange={(e) => setDateText(maskDate(e.target.value))} placeholder="dd/mm/aaaa" aria-invalid={tried && !!errors.date} aria-describedby="date-err" />
            {err('date')}
          </div>
          <div className="field">
            <label htmlFor="qt">Quantidade</label>
            <input id="qt" inputMode="numeric" value={qtyText} onChange={(e) => setQtyText(e.target.value)} placeholder="0" aria-invalid={tried && !!errors.qty} aria-describedby="qty-err" />
            {err('qty')}
          </div>
        </div>

        <div className="field">
          <label htmlFor="pr">Preço por cota</label>
          <input
            id="pr"
            inputMode="decimal"
            value={priceText}
            onChange={(e) => { setPriceText(e.target.value); setPriceTouched(true); }}
            placeholder="R$ 0,00"
            aria-invalid={tried && !!errors.price}
            aria-describedby="pr-dica price-err"
          />
          {fromClose && <span id="pr-dica" className="hint">Fechamento de {dateBR(close!.date).slice(0, 5)}. Ajuste se pagou outro valor.</span>}
          {err('price')}
        </div>

        {showFees ? (
          <div className="field">
            <label htmlFor="tx">Custos e taxas (R$)</label>
            <input id="tx" inputMode="decimal" value={feesText} onChange={(e) => setFeesText(e.target.value)} placeholder="0,00" aria-invalid={tried && !!errors.fees} aria-describedby="fees-err" />
            {err('fees')}
          </div>
        ) : (
          <button type="button" className="text-btn" onClick={() => setShowFees(true)}>{Icon.add(16)}Adicionar custos e taxas</button>
        )}

        {side === 'sell' && t && TICKER_RE.test(t) && validDate && <p className="muted small">Saldo em {dateText}: {fmtQty(held)} cotas.</p>}
      </form>

      <div className="form-foot">
        <div className="total">
          <span>Total da operação</span>
          <b>{brl(total)}</b>
        </div>
        <button type="submit" form="trade" className="btn primary">{side === 'buy' ? 'Adicionar à carteira' : 'Registrar venda'}</button>
      </div>
    </div>
  );
}
