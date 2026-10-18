const brlFmt = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const brl0Fmt = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
const numFmt = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 8 });

const MINUS = '−';
const clean = (s: string) => s.replace(/ /g, ' ');

export const brl = (v: number) => clean(brlFmt.format(v));
export const brl0 = (v: number) => clean(brl0Fmt.format(v));
export const brlSigned = (v: number) => (v < 0 ? MINUS : '+') + brl(Math.abs(v));
export const qty = (v: number) => numFmt.format(v);

/** fração → '+12,34%'. null/NaN → '—' */
export function pct(r: number | null | undefined, digits = 2, signed = true): string {
  if (r == null || !Number.isFinite(r)) return '—';
  const v = r * 100;
  const abs = Math.abs(v).toFixed(digits);
  const zero = Number(abs) === 0;
  const sign = zero ? '' : v > 0 ? (signed ? '+' : '') : MINUS;
  return sign + abs.replace('.', ',') + '%';
}

/** número com sinal, ex.: índice de Sharpe */
export function signed(v: number | null | undefined, digits = 2): string {
  if (v == null || !Number.isFinite(v)) return '—';
  const abs = Math.abs(v).toFixed(digits);
  return (Number(abs) === 0 ? '' : v > 0 ? '+' : MINUS) + abs.replace('.', ',');
}

/** "1.234,56" ou "1234.56" → 1234.56; inválido → NaN */
export function parseNumberBR(s: string): number {
  const t = s.replace(/[R$\s]/g, '');
  if (!t) return NaN;
  const normalized = t.includes(',') ? t.replace(/\./g, '').replace(',', '.') : t;
  return /^-?\d*\.?\d+$/.test(normalized) ? Number(normalized) : NaN;
}

/** razão rentabilidade ÷ CDI → '130%' */
export const ratio = (r: number | null | undefined) =>
  r == null || !Number.isFinite(r) ? '—' : `${r < 0 ? MINUS : ''}${Math.abs(Math.round(r * 100))}%`;

export const tone = (v: number | null | undefined) =>
  v == null || !Number.isFinite(v) || Math.abs(v) < 0.00005 ? '' : v > 0 ? 'pos' : 'neg';
