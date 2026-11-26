import type { Currency } from "./money";
import { sumMinor } from "./money";
import type { Frequency } from "./dates";
import type { ExchangeQuote, QuoteState } from "./quotes";
import type { NewsOverview, NewsPage } from "./news";
import type { MarketSnapshot } from "./markets";
export type EntryKind = "income" | "expense" | "transfer" | "exchange";
export interface Account {
  id: string;
  name: string;
  currency: Currency;
  openingMinor: number;
  openingDate?: string | null;
}
export interface Entry {
  id: string;
  kind: EntryKind;
  accountId: string;
  targetAccountId: string | null;
  amountMinor: number;
  currency: Currency;
  description: string;
  category: string;
  date: string;
  occurrenceId?: string | null;
  imported?: boolean;
  targetCurrency?: Currency | null;
  targetAmountMinor?: number | null;
  exchangeRate?: string | null;
  exchangeQuoteId?: string | null;
}
export interface Payment {
  id: string;
  title: string;
  // null significa que todavía falta definir el importe; nunca equivale a cero.
  amountMinor: number | null;
  amountSource: "manual" | "inherited";
  currency: Currency;
  dueDate: string;
  frequency: Frequency;
  paid: boolean;
}
export interface Article {
  id: string;
  title: string;
  summary: string;
  source: string;
  url: string;
  publishedAt: string;
}
export interface Edition {
  period: string;
  refreshedAt: string;
  articles: Article[];
}
export interface Snapshot {
  markets?: MarketSnapshot;
  news?: NewsOverview;
  newsPage?: NewsPage;
  accounts: Account[];
  entries: Entry[];
  payments: Payment[];
  favorites: string[];
  editions: { daily: Edition | null; weekly: Edition | null };
  asOf: string;
  dismissedPaymentIds: string[];
  paymentNoticeFingerprint: string | null;
  quotes: ExchangeQuote[];
  previousQuotes?: ExchangeQuote[];
  quoteState: QuoteState;
}
export function accountBalance(account: Account, entries: Entry[]): number {
  return sumMinor([
    account.openingMinor,
    ...entries
      .filter((e) => entryAffectsCurrency(e, account.currency))
      .map((e) => {
        if (e.kind === "exchange") {
          if (e.accountId === account.id) return -e.amountMinor;
          if (e.targetAccountId === account.id) {
            if (e.targetAmountMinor == null)
              throw new Error("El cambio no tiene importe de destino.");
            return e.targetAmountMinor;
          }
          return 0;
        }
        if (e.kind === "transfer")
          return e.accountId === account.id
            ? -e.amountMinor
            : e.targetAccountId === account.id
              ? e.amountMinor
              : 0;
        return e.accountId === account.id
          ? e.kind === "income"
            ? e.amountMinor
            : -e.amountMinor
          : 0;
      }),
  ]);
}
export function summarize(snapshot: Snapshot, currency: Currency) {
  const month = snapshot.asOf.slice(0, 7);
  const entries = snapshot.entries.filter(
    (e) => entryAffectsCurrency(e, currency) && e.date <= snapshot.asOf,
  );
  const current = entries.filter((e) => e.date.startsWith(month));
  const income = sumMinor(current.filter((e) => e.kind === "income").map((e) => e.amountMinor));
  const expenses = sumMinor(current.filter((e) => e.kind === "expense").map((e) => e.amountMinor));
  const balance = sumMinor(
    snapshot.accounts.filter((a) => a.currency === currency).map((a) => accountBalance(a, entries)),
  );
  const payments = snapshot.payments.filter(
    (p) => p.currency === currency && !p.paid && p.dueDate.slice(0, 7) <= month,
  );
  const { knownMinor: pending, unknownCount } = paymentTotals(payments);
  return {
    income,
    expenses,
    balance,
    pending,
    unknownCount,
    projected: unknownCount ? null : sumMinor([balance, -pending]),
  };
}

export function entryAffectsCurrency(entry: Entry, currency: Currency): boolean {
  return (
    entry.currency === currency || (entry.kind === "exchange" && entry.targetCurrency === currency)
  );
}
export function entryDisplay(entry: Entry, currency: Currency) {
  const incomingExchange = entry.kind === "exchange" && entry.targetCurrency === currency;
  const amountMinor = incomingExchange ? entry.targetAmountMinor : entry.amountMinor;
  if (amountMinor == null) throw new Error("El movimiento no tiene un importe válido.");
  return {
    amountMinor,
    currency: incomingExchange ? currency : entry.currency,
    sign:
      entry.kind === "income" || incomingExchange
        ? "+ "
        : entry.kind === "expense" || entry.kind === "exchange"
          ? "− "
          : "",
    label:
      entry.kind === "exchange"
        ? "Cambio de moneda"
        : entry.kind === "income"
          ? "Ingreso"
          : entry.kind === "expense"
            ? "Gasto"
            : "Transferencia",
  };
}
/** Usar sólo con pagos de una misma moneda, seleccionados por quien llama. */
export function paymentTotals(payments: Payment[]) {
  return {
    knownMinor: sumMinor(
      payments.flatMap((payment) => (payment.amountMinor === null ? [] : [payment.amountMinor])),
    ),
    unknownCount: payments.filter((payment) => payment.amountMinor === null).length,
  };
}
