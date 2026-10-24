/** descrições curtas dos ativos mais comuns da carteira, no formato do protótipo */
const KNOWN: Record<string, string> = {
  WRLD11: 'ETF · ações globais',
  MUND11: 'ETF · ações globais',
  B5P211: 'ETF · IPCA+ curto',
};

/** "ETF · ações globais"; para os demais, o tipo deduzido do nome ou do código */
export function describe(ticker: string, name?: string): string {
  const base = ticker.replace(/F$/, '');
  if (KNOWN[base]) return KNOWN[base];
  const n = (name ?? '').toUpperCase();
  if (/IMOBILI|\bFII\b/.test(n)) return 'Fundo imobiliário';
  if (/\bETF\b|FUNDO DE [IÍ]NDICE|\bINDEX\b/.test(n)) return 'ETF';
  if (/3[245]$/.test(base)) return 'BDR';
  if (/11$/.test(base)) return 'Unit / fundo';
  return /3$/.test(base) ? 'Ação ordinária' : /[456]$/.test(base) ? 'Ação preferencial' : 'Ativo da B3';
}

/** classes de ativo usadas nas metas de alocação */
export const CLASSES = ['RF Brasil', 'RV Brasil', 'RF Internacional', 'RV Internacional', 'FIIs', 'Cripto', 'Outros'] as const;

const KNOWN_CLASS: Record<string, string> = {
  WRLD11: 'RV Internacional',
  MUND11: 'RV Internacional',
  B5P211: 'RF Brasil',
};

/** classe do ativo: a escolhida em Ajustes ou a deduzida do código e do nome */
export function classOf(ticker: string, chosen: Record<string, string>, name?: string): string {
  if (chosen[ticker]) return chosen[ticker];
  const base = ticker.replace(/F$/, '');
  if (KNOWN_CLASS[base]) return KNOWN_CLASS[base];
  const d = describe(ticker, name);
  if (d === 'Fundo imobiliário') return 'FIIs';
  if (d === 'BDR') return 'RV Internacional';
  if (d.startsWith('Ação')) return 'RV Brasil';
  return 'Outros';
}

/** metas antigas eram por ticker; viram metas por classe, somando os ativos de cada uma */
export function migrateTargets(targets: Record<string, number>, chosen: Record<string, string>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(targets)) {
    const cls = (CLASSES as readonly string[]).includes(k) ? k : classOf(k, chosen);
    out[cls] = (out[cls] ?? 0) + v;
  }
  return out;
}
