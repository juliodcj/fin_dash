import type { PriceHistory } from '../src/lib/types';

export function fetchYahoo(ticker: string): Promise<PriceHistory>;
