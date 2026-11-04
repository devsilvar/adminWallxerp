export interface FxProvider {
  readonly name: string;
  /** Returns NGN per 1 unit of each quote currency, e.g. { USD: 1348.8 }. */
  fetchNgnRates(quotes: string[]): Promise<Record<string, number>>;
}
