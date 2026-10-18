import { useRef, useState } from 'react';
import { Icon, Toggle } from '../components/ui';
import { PERIODS } from '../lib/finance';
import { parseNumberBR, pct } from '../lib/format';
import type { Period, Settings, Trade } from '../lib/types';
import { useApp } from '../state';
import { usePortfolio } from '../useData';

export function Ajustes() {
  const { settings, updateSettings, trades, replaceAll, resetAll, loadSample } = useApp();
  const p = usePortfolio();
  const [msg, setMsg] = useState('');
  const [sampleMsg, setSampleMsg] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const targetSum = Object.values(settings.targets).reduce((a, b) => a + b, 0);

  const exportJson = () => {
    const blob = new Blob([JSON.stringify({ version: 1, trades, settings }, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `fin-dash-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const importJson = async (file: File) => {
    try {
      const data = JSON.parse(await file.text()) as { trades?: Trade[]; settings?: Partial<Settings> };
      if (!Array.isArray(data.trades)) throw new Error('arquivo sem lançamentos');
      const ok = data.trades.every((t) => t && typeof t.ticker === 'string' && typeof t.date === 'string' && t.qty > 0 && t.price > 0);
      if (!ok) throw new Error('lançamentos inválidos');
      if (!confirm(`Substituir os lançamentos atuais por ${data.trades.length} do arquivo?`)) return;
      // backups antigos trazem o token da brapi, que não é mais usado
      const { brapiToken: _, ...s } = { ...data.settings } as Partial<Settings> & { brapiToken?: string };
      replaceAll(data.trades.map((t) => ({ ...t, fees: t.fees ?? 0 })), s);
      setMsg('Backup importado.');
    } catch (e) {
      setMsg(`Não foi possível importar: ${(e as Error).message}.`);
    }
  };

  return (
    <div className="screen settings">
      <header className="screen-head"><h1>Ajustes</h1></header>

      <section className="card">
        <h2>Rentabilidade</h2>
        <div className="field">
          <span className="toggle-label" id="method-label">Método de cálculo</span>
          <div role="group" aria-labelledby="method-label" className="segmented two">
            <button type="button" aria-pressed={settings.method === 'twr'} onClick={() => updateSettings({ method: 'twr' })}>TWR · por cotas</button>
            <button type="button" aria-pressed={settings.method === 'mwrr'} onClick={() => updateSettings({ method: 'mwrr' })}>MWRR · TIR</button>
          </div>
          <span className="hint">
            {settings.method === 'twr'
              ? 'Mede o desempenho dos ativos: aportes e resgates não mudam o resultado. É o padrão de fundos e o mais justo para comparar com CDI e IPCA.'
              : 'Mede o rendimento do seu dinheiro, pesando quanto estava investido em cada momento (TIR dos aportes). CDI e IPCA recebem os mesmos aportes nas mesmas datas. Drawdown, volatilidade, Sharpe e retornos mensais seguem por cotas.'}
          </span>
        </div>
        <Toggle
          id="annualize"
          checked={settings.annualize}
          onChange={(v) => updateSettings({ annualize: v })}
          label="Anualizar períodos acima de 12 meses"
          hint="Rentabilidade da carteira, do CDI e do IPCA em 24M e Máx aparece ao ano (a.a.)."
        />
        <div className="field-row">
          <label htmlFor="period">Período padrão</label>
          <div className="select-wrap">
            <select id="period" value={settings.defaultPeriod} onChange={(e) => updateSettings({ defaultPeriod: e.target.value as Period })}>
              {PERIODS.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}
            </select>
            {Icon.down(16)}
          </div>
        </div>
      </section>

      {p.holdings.length > 0 && (
        <section className="card">
          <h2>Metas de alocação</h2>
          <p className="muted small">Opcional. Aparece ao lado da alocação atual de cada ativo.</p>
          {p.holdings.map((h) => (
            <div key={h.ticker} className="field-row">
              <label htmlFor={`t-${h.ticker}`}>{h.ticker}<span className="muted small"> · atual {pct(h.weight, 1, false)}</span></label>
              <div className="suffix">
                <input
                  key={`${h.ticker}-${settings.targets[h.ticker] ?? ''}`}
                  id={`t-${h.ticker}`}
                  inputMode="decimal"
                  defaultValue={settings.targets[h.ticker] != null ? String(Math.round(settings.targets[h.ticker] * 1000) / 10).replace('.', ',') : ''}
                  placeholder="—"
                  onBlur={(e) => {
                    const v = parseNumberBR(e.target.value);
                    const targets = { ...settings.targets };
                    if (Number.isFinite(v) && v >= 0 && v <= 100) targets[h.ticker] = v / 100;
                    else delete targets[h.ticker];
                    updateSettings({ targets });
                  }}
                />
                <span>%</span>
              </div>
            </div>
          ))}
          {targetSum > 0 && Math.abs(targetSum - 1) > 0.001 && <p className="field-error">As metas somam {pct(targetSum, 1, false)}; o ideal é 100%.</p>}
        </section>
      )}

      <section className="card">
        <h2>Dados de mercado</h2>
        <p className="muted small">
          Cotações do último fechamento da B3 (Yahoo Finance), atualizadas uma vez por dia. CDI (Ipeadata, série do Banco Central) e IPCA (IBGE) também são atualizados todo dia. Nada disso precisa de cadastro ou token.
        </p>
        <Toggle id="demo" checked={settings.demo} onChange={(v) => updateSettings({ demo: v })} label="Modo demonstração" hint="Usa cotações e índices simulados, sem internet." />
      </section>

      <section className="card">
        <h2>Backup</h2>
        <p className="muted small">Seus lançamentos ficam só neste aparelho. Exporte um arquivo para guardar ou levar para outro aparelho.</p>
        <div className="btn-row">
          <button type="button" className="btn ghost" onClick={exportJson} disabled={!trades.length}>Exportar</button>
          <button type="button" className="btn ghost" onClick={() => fileRef.current?.click()}>Importar</button>
          <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) void importJson(f); e.target.value = ''; }} />
        </div>
        {msg && <p className="small" role="status">{msg}</p>}
      </section>

      <section className="card">
        <h2>Carteira</h2>
        <div className="btn-row">
          <button
            type="button"
            className="btn ghost"
            onClick={async () => {
              if (trades.length && !confirm('Substituir seus lançamentos pela carteira exemplo?')) return;
              setSampleMsg('');
              try { await loadSample(); setSampleMsg('Carteira exemplo carregada.'); } catch (e) { setSampleMsg((e as Error).message); }
            }}
          >
            Carregar carteira exemplo
          </button>
          <button type="button" className="btn danger" onClick={() => { if (confirm('Apagar todos os lançamentos e ajustes deste aparelho?')) resetAll(); }}>Apagar tudo</button>
        </div>
        {sampleMsg && <p className="small" role="status">{sampleMsg}</p>}
      </section>
      <p className="footnote">Fin Dash · cálculos por cotas (TWR) · não considera IR nem proventos fora do preço ajustado</p>
    </div>
  );
}
