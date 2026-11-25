import type { Snapshot, Payment } from "../domain/finance";
import { occurrenceDates } from "../domain/dates";
import captured from "~/data/captured-quotes.json";
import type { ExchangeQuote, QuoteState } from "../domain/quotes";
import { convertMinor } from "../domain/exchange";
const capturedQuotes = captured.quotes as ExchangeQuote[];
const exampleQuote = capturedQuotes.find((quote) => quote.series === "usd-oficial")!;
const examplePurchaseCost = convertMinor(10000, "USD", "ARS", exampleQuote.sellRate);
function previewPayments(templates: Omit<Payment, "amountSource">[]): Payment[] {
  return templates
    .flatMap((payment) =>
      occurrenceDates(`2026-06-${payment.dueDate.slice(8)}`, "monthly", 11).map((dueDate) => ({
        ...payment,
        id: `${payment.id}:${dueDate}`,
        dueDate,
        amountSource: "inherited" as const,
        amountMinor: payment.id === "luz" && dueDate >= "2026-11-01" ? null : payment.amountMinor,
        paid:
          dueDate.slice(0, 7) < "2026-11"
            ? !(payment.id === "monotributo" && dueDate.startsWith("2026-10"))
            : dueDate.startsWith("2026-11") && payment.paid,
      })),
    )
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
}
// Ejemplo público para la portada y la revisión local. Nunca se escribe en D1.
export const productExample: Snapshot = {
  asOf: captured.asOf,
  dismissedPaymentIds: [],
  paymentNoticeFingerprint: null,
  quotes: capturedQuotes,
  quoteState: captured.quoteState as QuoteState,
  accounts: [
    { id: "ars", name: "Cuenta en pesos", currency: "ARS", openingMinor: 85000000 },
    { id: "usd", name: "Cuenta en dólares", currency: "USD", openingMinor: 125000 },
    { id: "eur", name: "Euros de ejemplo", currency: "EUR", openingMinor: 35000 },
    { id: "clp", name: "Pesos chilenos de ejemplo", currency: "CLP", openingMinor: 50000 },
  ],
  entries: [
    {
      id: "example-exchange",
      kind: "exchange",
      accountId: "ars",
      targetAccountId: "usd",
      amountMinor: examplePurchaseCost,
      currency: "ARS",
      targetCurrency: "USD",
      targetAmountMinor: 10000,
      exchangeRate: exampleQuote.sellRate,
      exchangeQuoteId: exampleQuote.id,
      description: "Cambio de ARS a USD",
      category: "Cambio de moneda",
      date: captured.asOf,
    },
    {
      id: "1",
      kind: "expense",
      accountId: "ars",
      targetAccountId: null,
      amountMinor: 4250000,
      currency: "ARS",
      description: "Supermercado",
      category: "Alimentación",
      date: "2026-11-12",
    },
    {
      id: "2",
      kind: "expense",
      accountId: "ars",
      targetAccountId: null,
      amountMinor: 1800000,
      currency: "ARS",
      description: "Internet de casa",
      category: "Servicios",
      date: "2026-11-10",
    },
    {
      id: "3",
      kind: "income",
      accountId: "ars",
      targetAccountId: null,
      amountMinor: 120000000,
      currency: "ARS",
      description: "Sueldo de noviembre",
      category: "Trabajo",
      date: "2026-11-05",
    },
    {
      id: "4",
      kind: "expense",
      accountId: "ars",
      targetAccountId: null,
      amountMinor: 2950000,
      currency: "ARS",
      description: "Transporte",
      category: "Transporte",
      date: "2026-11-04",
    },
    {
      id: "5",
      kind: "expense",
      accountId: "ars",
      targetAccountId: null,
      amountMinor: 15000000,
      currency: "ARS",
      description: "Alquiler",
      category: "Hogar",
      date: "2026-11-01",
    },
  ],
  payments: previewPayments([
    {
      id: "internet",
      title: "Internet de casa",
      amountMinor: 1800000,
      currency: "ARS",
      dueDate: "2026-11-10",
      frequency: "monthly",
      paid: true,
    },
    {
      id: "monotributo",
      title: "Monotributo",
      amountMinor: 3200000,
      currency: "ARS",
      dueDate: "2026-11-20",
      frequency: "monthly",
      paid: false,
    },
    {
      id: "luz",
      title: "Electricidad",
      amountMinor: 2450000,
      currency: "ARS",
      dueDate: "2026-11-23",
      frequency: "monthly",
      paid: false,
    },
    {
      id: "seguro",
      title: "Seguro del auto",
      amountMinor: 4800000,
      currency: "ARS",
      dueDate: "2026-11-27",
      frequency: "monthly",
      paid: false,
    },
  ]),
  favorites: ["AAPL", "MSFT", "MELI"],
  editions: { daily: null, weekly: null },
};
