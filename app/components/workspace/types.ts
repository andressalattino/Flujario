import type { Entry, Payment } from "~/domain/finance";
export type PaymentModal = { kind: "pay" | "edit-payment"; payment: Payment };
export type Modal =
  | "entry"
  | "payment"
  | "setup"
  | "exchange"
  | "add-currency"
  | PaymentModal
  | { kind: "edit-expense"; expense: Entry }
  | null;
export type Open = (value: Modal) => void;
