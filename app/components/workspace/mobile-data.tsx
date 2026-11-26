import { entryDisplay, type Entry, type Payment } from "~/domain/finance";
import type { ReactNode } from "react";
import { formatMoney, type Currency } from "~/domain/money";
import { EntryRate } from "./entry-rate";
import { formatDate, frequencyLabels } from "~/domain/dates";
import { Button } from "../ui/button";
import type { Open } from "./types";

export function MobileEntries({
  entries,
  currency,
  renderAction,
}: {
  entries: Entry[];
  currency: Currency;
  renderAction?: (entry: Entry) => ReactNode;
}) {
  return (
    <div className="mobile-data-list">
      {entries.map((entry) => {
        const display = entryDisplay(entry, currency);
        return (
          <article key={entry.id} className="mobile-data-card">
            <div className="mobile-data-top">
              <h3>{entry.description}</h3>
              <span className={`movement-kind ${entry.kind}`}>{display.label}</span>
            </div>
            <p className={`mobile-data-amount movement-amount ${entry.kind}`}>
              {display.sign}
              {formatMoney(display.amountMinor, display.currency)} <small>{display.currency}</small>
            </p>
            <EntryRate entry={entry} />
            <p className="mobile-data-meta">
              {entry.category} · {formatDate(entry.date)} {entry.date.slice(0, 4)}
              {entry.occurrenceId ? " · Pago registrado" : ""}
            </p>
            {renderAction?.(entry)}
          </article>
        );
      })}
    </div>
  );
}
export function MobilePayments({
  payments,
  asOf,
  open,
}: {
  payments: Payment[];
  asOf: string;
  open: Open;
}) {
  return (
    <div className="mobile-data-list">
      {payments.map((payment) => (
        <article className="mobile-data-card" key={payment.id}>
          <div className="mobile-data-top">
            <h3>{payment.title}</h3>
            <span className={payment.dueDate < asOf && !payment.paid ? "mobile-overdue" : ""}>
              {payment.paid ? "Pagado" : payment.dueDate < asOf ? "Vencido" : "Pendiente"}
            </span>
          </div>
          <p className="mobile-data-amount">
            {payment.amountMinor === null
              ? "Sin importe"
              : formatMoney(payment.amountMinor, payment.currency)}{" "}
            <small>{payment.currency}</small>
          </p>
          <p className="mobile-data-meta">
            Vence: {formatDate(payment.dueDate)} {payment.dueDate.slice(0, 4)} ·{" "}
            {frequencyLabels[payment.frequency]}
          </p>
          {!payment.paid && (
            <div className="payment-row-actions">
              <Button
                size="sm"
                variant="outline"
                onClick={() => open({ kind: "pay", payment })}
                aria-label={`Pagar ${payment.title}`}
              >
                Pagar
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => open({ kind: "edit-payment", payment })}
                aria-label={`Editar importe de ${payment.title}`}
              >
                Editar importe
              </Button>
            </div>
          )}
        </article>
      ))}
    </div>
  );
}
