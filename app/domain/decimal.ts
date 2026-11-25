// Las tasas se conservan como texto decimal. BigInt permite operar con su fracción exacta.
export function canonicalRate(value: unknown): string {
  if (typeof value !== "string")
    throw new Error("La cotización debe conservar su decimal original.");
  const text = value
    .trim()
    .replace(/(\.\d*?)0+$/, "$1")
    .replace(/\.$/, "");
  if (!/^(?:0|[1-9]\d{0,11})(?:\.\d{1,8})?$/.test(text) || /^0(?:\.0+)?$/.test(text))
    throw new Error("Ingresá una cotización mayor a cero, con hasta 8 decimales.");
  return text;
}
export function parseRate(input: string): string {
  const text = input.trim();
  if (!/^(?:0|[1-9]\d*|[1-9]\d{0,2}(?:\.\d{3})+)(?:,\d{1,8})?$/.test(text))
    throw new Error("Usá coma decimal en la cotización, por ejemplo 1.500,25.");
  return canonicalRate(text.replaceAll(".", "").replace(",", "."));
}
export function rateFraction(rate: string) {
  const [whole = "0", fraction = ""] = canonicalRate(rate).split(".");
  return { numerator: BigInt(whole + fraction), denominator: 10n ** BigInt(fraction.length) };
}
export function rateInput(rate: string): string {
  return canonicalRate(rate).replace(".", ",");
}
export function formatRate(rate: string): string {
  const [whole = "0", fraction] = canonicalRate(rate).split(".");
  const grouped = new Intl.NumberFormat("es-AR").format(BigInt(whole));
  return fraction ? `${grouped},${fraction}` : grouped;
}
