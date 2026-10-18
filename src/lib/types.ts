export type Side = 'buy' | 'sell';

export interface Trade {
  id: string;
  ticker: string;
  side: Side;
  /** data da operação, AAAA-MM-DD */
  date: string;
  qty: number;
  /** preço por cota informado pelo usuário */
  price: number;
  /** corretagem, emolumentos etc. */
  fees: number;
}

export interface PricePoint {
  date: string;
  close: number;
  /** fechamento ajustado por proventos (igual ao close quando a fonte não informa) */
  adj: number;
}

export interface PriceHistory {
  ticker: string;
  name?: string;
  points: PricePoint[];
  /** última cotação */
  price: number;
  /** variação do dia em fração (0,0084 = +0,84%) */
  changePct: number | null;
}

/** CDI diário: taxa do dia em fração */
export interface RatePoint {
  date: string;
  rate: number;
}

/** IPCA mensal: variação do mês em fração */
export interface MonthRate {
  month: string;
  rate: number;
}

export type Period = '1M' | '6M' | '12M' | '24M' | 'YTD' | 'MAX';

/** twr: por cotas (tempo); mwrr: ponderada pelo dinheiro (TIR dos aportes) */
export type Method = 'twr' | 'mwrr';

export interface Settings {
  /** rentabilidade de períodos acima de 12 meses exibida ao ano */
  annualize: boolean;
  defaultPeriod: Period;
  method: Method;
  demo: boolean;
  /** metas de alocação por ticker, em fração */
  targets: Record<string, number>;
}

export interface Market {
  prices: Record<string, PriceHistory>;
  cdi: RatePoint[];
  ipca: MonthRate[];
  errors: string[];
  updatedAt: string | null;
}
