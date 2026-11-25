import { rateFraction } from "./decimal";
import { quoteDate, type ExchangeQuote } from "./quotes";

export function quoteChange(current: ExchangeQuote, previous?: ExchangeQuote) {
  if (
    !previous ||
    previous.series !== current.series ||
    previous.currency !== current.currency ||
    quoteDate(previous) >= quoteDate(current)
  )
    return null;
  const a = rateFraction(current.sellRate),
    b = rateFraction(previous.sellRate);
  const difference = a.numerator * b.denominator - b.numerator * a.denominator;
  const absolute = difference < 0n ? -difference : difference;
  const denominator = a.denominator * b.numerator;
  const hundredths = (absolute * 20000n + denominator) / (2n * denominator);
  const direction = difference === 0n ? "unchanged" : difference > 0n ? "up" : "down";
  const percent =
    absolute > 0n && hundredths === 0n
      ? "< 0,01 %"
      : `${hundredths / 100n},${String(hundredths % 100n).padStart(2, "0")} %`;
  return { direction, percent, comparedAt: previous.sourceAsOf, comparedDate: quoteDate(previous) };
}
