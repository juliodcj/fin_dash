import type { MonthRate, PriceHistory, RatePoint } from '../src/lib/types';

export function fetchYahoo(ticker: string): Promise<PriceHistory>;
export function fetchCdi(): Promise<RatePoint[]>;
export function fetchIpca(): Promise<MonthRate[]>;
