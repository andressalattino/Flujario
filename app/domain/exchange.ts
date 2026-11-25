import { currencyInfo, type Currency } from "./currencies";
import { assertMinor, MAX_MINOR } from "./money";
import { rateFraction } from "./decimal";
export function exchangePair(from: Currency, to: Currency) {
  if (from === to) throw new Error("Elegí dos monedas diferentes.");
  return from === "ARS"
    ? { base: to, quote: from }
    : to === "ARS"
      ? { base: from, quote: to }
      : { base: to, quote: from };
}
function rounded(numerator: bigint, denominator: bigint): bigint {
  // Cantidades positivas: mitad hacia arriba, elegido por el usuario.
  return (numerator * 2n + denominator) / (denominator * 2n);
}
export function convertMinor(amount: number, from: Currency, to: Currency, rate: string): number {
  assertMinor(amount);
  if (amount <= 0 || amount > MAX_MINOR) throw new Error("Ingresá un importe válido.");
  const pair = exchangePair(from, to);
  const fraction = rateFraction(rate);
  const fromScale = 10n ** BigInt(currencyInfo[from].digits);
  const toScale = 10n ** BigInt(currencyInfo[to].digits);
  const result =
    pair.base === from
      ? rounded(BigInt(amount) * fraction.numerator * toScale, fromScale * fraction.denominator)
      : rounded(BigInt(amount) * fraction.denominator * toScale, fromScale * fraction.numerator);
  if (result <= 0n || result > BigInt(MAX_MINOR))
    throw new Error("El resultado queda fuera del importe permitido para esta moneda.");
  return Number(result);
}
