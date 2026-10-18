/** descrições curtas dos ativos mais comuns da carteira, no formato do protótipo */
const KNOWN: Record<string, string> = {
  WRLD11: 'ETF · ações globais',
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
