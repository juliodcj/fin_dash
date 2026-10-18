import { useState, type FormEvent } from 'react';
import { Icon } from '../components/ui';
import { dateBR, todayISO } from '../lib/dates';
import { qtyAt } from '../lib/finance';
import { brl, parseNumberBR, qty as fmtQty } from '../lib/format';
import type { Side } from '../lib/types';
import { href, navigate } from '../router';
import { useApp } from '../state';

// raiz de 4 caracteres (pode ter dígitos, ex.: B5P211) + número da classe
const TICKER_RE = /^[A-Z][A-Z0-9]{3}\d{1,2}F?$/;

export function Lancamento({ initialTicker }: { initialTicker?: string }) {
  const { trades, addTrade } = useApp();
  const known = [...new Set(trades.map((t) => t.ticker))].sort();
  const [side, setSide] = useState<Side>('buy');
  const [ticker, setTicker] = useState(initialTicker ?? '');
  const [date, setDate] = useState(todayISO());
  const [qtyText, setQtyText] = useState('');
  const [priceText, setPriceText] = useState('');
  const [showFees, setShowFees] = useState(false);
  const [feesText, setFeesText] = useState('');
  const [tried, setTried] = useState(false);

  const t = ticker.trim().toUpperCase();
  const q = parseNumberBR(qtyText);
  const price = parseNumberBR(priceText);
  const fees = feesText.trim() ? parseNumberBR(feesText) : 0;
  const held = t ? qtyAt(trades, t, date) : 0;

  const errors: Record<string, string> = {};
  if (!TICKER_RE.test(t)) errors.ticker = 'Use o código da B3, ex.: WRLD11, PETR4.';
  if (!date || date > todayISO()) errors.date = 'Informe uma data até hoje.';
  if (!(q > 0) || !Number.isInteger(q)) errors.qty = 'Quantidade inteira maior que zero.';
  else if (side === 'sell' && q > held) errors.qty = `Você tinha ${fmtQty(held)} cotas de ${t} nessa data.`;
  if (!(price > 0)) errors.price = 'Informe o preço pago por cota.';
  if (!(fees >= 0)) errors.fees = 'Valor inválido.';
  const valid = Object.keys(errors).length === 0;
  const total = q > 0 && price > 0 ? q * price + (side === 'buy' ? fees || 0 : -(fees || 0)) : 0;
  const err = (k: string) => (tried && errors[k] ? <span className="field-error" id={`${k}-err`}>{errors[k]}</span> : null);

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
            onChange={(e) => setTicker(e.target.value.toUpperCase())}
            list="tickers"
            autoComplete="off"
            autoCapitalize="characters"
            placeholder="Ex.: WRLD11"
            aria-invalid={tried && !!errors.ticker}
            aria-describedby="ticker-err"
          />
          <datalist id="tickers">{known.map((k) => <option key={k} value={k} />)}</datalist>
          {err('ticker')}
        </div>

        <div className="grid2">
          <div className="field">
            <label htmlFor="dt">Data</label>
            <input id="dt" type="date" value={date} max={todayISO()} onChange={(e) => setDate(e.target.value)} aria-invalid={tried && !!errors.date} aria-describedby="date-err" />
            {err('date')}
          </div>
          <div className="field">
            <label htmlFor="qt">Quantidade</label>
            <input id="qt" inputMode="numeric" value={qtyText} onChange={(e) => setQtyText(e.target.value)} placeholder="0" aria-invalid={tried && !!errors.qty} aria-describedby="qty-err" />
            {err('qty')}
          </div>
        </div>

        <div className="field">
          <label htmlFor="pr">Preço por cota (R$)</label>
          <input id="pr" inputMode="decimal" value={priceText} onChange={(e) => setPriceText(e.target.value)} placeholder="0,00" aria-invalid={tried && !!errors.price} aria-describedby="price-err" />
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

        {side === 'sell' && t && TICKER_RE.test(t) && <p className="muted small">Saldo em {dateBR(date)}: {fmtQty(held)} cotas.</p>}
      </form>

      <div className="form-foot">
        <div className="total">
          <span>Total da operação</span>
          <b>{brl(total)}</b>
        </div>
        <button type="submit" form="trade" className="btn primary">{side === 'buy' ? 'Adicionar compra' : 'Adicionar venda'}</button>
      </div>
    </div>
  );
}
