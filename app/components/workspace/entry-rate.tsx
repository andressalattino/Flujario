import type { Entry } from "~/domain/finance";
import { formatRate } from "~/domain/decimal";
import { exchangePair } from "~/domain/exchange";
export function EntryRate({ entry }: { entry: Entry }) {
  if (entry.kind !== "exchange" || !entry.targetCurrency || !entry.exchangeRate) return null;
  const pair = exchangePair(entry.currency, entry.targetCurrency);
  return (
    <small className="entry-rate">
      1 {pair.base} = {formatRate(entry.exchangeRate)} {pair.quote}
    </small>
  );
}
