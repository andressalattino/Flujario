import { isISODate } from "./dates";
import type { Payment } from "./finance";
import type { Currency } from "./money";

export const PAYMENT_MONTH_RANGE = 5;
export type PaymentFilter = "pending" | "paid" | "all" | "previous";

export function isYearMonth(value: string): boolean {
  return /^\d{4}-\d{2}$/.test(value) && isISODate(`${value}-01`);
}
export function shiftMonth(month: string, offset: number): string {
  if (!isYearMonth(month) || !Number.isInteger(offset)) throw new Error("Mes inválido.");
  const [year, number] = month.split("-").map(Number) as [number, number];
  const date = new Date(Date.UTC(year, number - 1 + offset, 1, 12));
  const result = date.toISOString().slice(0, 7);
  if (!isYearMonth(result)) throw new Error("Mes fuera del rango admitido.");
  return result;
}
export function monthLabel(month: string): string {
  if (!isYearMonth(month)) throw new Error("Mes inválido.");
  const label = new Intl.DateTimeFormat("es-AR", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${month}-01T12:00:00Z`));
  return label.charAt(0).toLocaleUpperCase("es-AR") + label.slice(1);
}
export function selectedPaymentMonth(requested: string | null, asOf: string): string {
  if (!isISODate(asOf)) throw new Error("Fecha de referencia inválida.");
  const current = asOf.slice(0, 7);
  if (!requested || !isYearMonth(requested)) return current;
  return requested >= shiftMonth(current, -PAYMENT_MONTH_RANGE) &&
    requested <= shiftMonth(current, PAYMENT_MONTH_RANGE)
    ? requested
    : current;
}
export function paymentFilter(value: string | null): PaymentFilter {
  return value === "paid" || value === "all" || value === "previous" ? value : "pending";
}
export function pendingFromClosedMonths(payments: Payment[], asOf: string): Payment[] {
  return payments
    .filter((payment) => !payment.paid && payment.dueDate.slice(0, 7) < asOf.slice(0, 7))
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.id.localeCompare(b.id));
}
export function visiblePaymentNotices(
  payments: Payment[],
  asOf: string,
  dismissedIds: string[],
): Payment[] {
  const dismissed = new Set(dismissedIds);
  return pendingFromClosedMonths(payments, asOf).filter((payment) => !dismissed.has(payment.id));
}
export function paymentsInMonth(
  payments: Payment[],
  month: string,
  currency: Currency,
  filter: Exclude<PaymentFilter, "previous"> = "pending",
): Payment[] {
  if (!isYearMonth(month)) throw new Error("Mes inválido.");
  return payments
    .filter(
      (payment) =>
        payment.currency === currency &&
        payment.dueDate.startsWith(`${month}-`) &&
        (filter === "all" || (filter === "paid" ? payment.paid : !payment.paid)),
    )
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.id.localeCompare(b.id));
}
