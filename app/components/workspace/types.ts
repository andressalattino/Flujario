import type { Payment } from "~/domain/finance";
export type PaymentModal = { kind: "pay" | "edit-payment"; payment: Payment };
export type Modal =
  "entry" | "payment" | "setup" | "exchange" | "add-currency" | PaymentModal | null;
export type Open = (value: Modal) => void;
