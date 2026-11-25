import { CalendarDays, Check, CircleHelp } from "lucide-react";
import { Empty } from "./shared";
import { Button } from "../ui/button";
import type { Open } from "./types";
import type { Snapshot } from "~/domain/finance";
import { formatMoney, type Currency } from "~/domain/money";
import { formatDate, frequencyLabels } from "~/domain/dates";
import { MobilePayments } from "./mobile-data";
import { Link } from "react-router";
import { PaymentMonthPicker } from "./payment-month-picker";
import { paymentsInMonth, pendingFromClosedMonths, type PaymentFilter } from "~/domain/payments";
export function Payments({
  snapshot,
  currency,
  filter,
  updateParam,
  open,
  month,
  base,
}: {
  snapshot: Snapshot;
  currency: Currency;
  filter: PaymentFilter;
  updateParam: (key: string, value: string) => void;
  open: Open;
  month: string;
  base: string;
}) {
  const payments =
    filter === "previous"
      ? pendingFromClosedMonths(snapshot.payments, snapshot.asOf).filter(
          (payment) => payment.currency === currency,
        )
      : paymentsInMonth(snapshot.payments, month, currency, filter);
  return (
    <>
      {filter === "previous" ? (
        <div className="previous-payment-heading">
          <h2>Pendientes de meses anteriores</h2>
          <p>Incluye los avisos silenciados y los pagos de hace más de cinco meses.</p>
          <Link to={`${base}/pagos?moneda=${currency}`} className="text-link">
            Volver al mes actual
          </Link>
        </div>
      ) : (
        <PaymentMonthPicker
          month={month}
          asOf={snapshot.asOf}
          onChange={(value) => updateParam("mes", value === snapshot.asOf.slice(0, 7) ? "" : value)}
        />
      )}
      <div className="section-tabs" aria-label="Estado de los pagos">
        {[
          ["pending", "Pendientes"],
          ["paid", "Pagados"],
          ["all", "Todos"],
          ["previous", "Meses anteriores"],
        ].map(([key, title]) => (
          <button
            key={key}
            aria-pressed={filter === key}
            className={filter === key ? "active" : ""}
            onClick={() => updateParam("estado", key!)}
          >
            {title}
          </button>
        ))}
      </div>
      <section className="data-panel">
        {payments.length ? (
          <>
            <div className="table-scroll desktop-data-table">
              <table className="finance-table payments-table">
                <thead>
                  <tr>
                    <th>Pago</th>
                    <th>Vencimiento</th>
                    <th>Importe</th>
                    <th>Estado</th>
                    <th>
                      <span className="sr-only">Acción</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {payments.map((p) => (
                    <tr key={p.id}>
                      <td>
                        <div className="transaction-name">
                          <span className="transaction-icon">
                            <CalendarDays size={17} />
                          </span>
                          <div>
                            {p.title}
                            <small>{frequencyLabels[p.frequency]}</small>
                          </div>
                        </div>
                      </td>
                      <td>
                        {formatDate(p.dueDate)}
                        <small className="table-year">{p.dueDate.slice(0, 4)}</small>
                      </td>
                      <td className="nowrap">
                        {p.amountMinor === null
                          ? "Sin importe"
                          : formatMoney(p.amountMinor, p.currency)}{" "}
                        <small>{p.currency}</small>
                      </td>
                      <td>
                        <span
                          className={`payment-status ${p.paid ? "paid" : p.dueDate < snapshot.asOf ? "overdue" : ""}`}
                        >
                          {p.paid ? (
                            <>
                              <Check size={13} /> Pagado
                            </>
                          ) : p.dueDate < snapshot.asOf ? (
                            "Vencido"
                          ) : (
                            "Pendiente"
                          )}
                        </span>
                      </td>
                      <td>
                        {!p.paid && (
                          <div className="payment-row-actions">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => open({ kind: "pay", payment: p })}
                              aria-label={`Pagar ${p.title}`}
                            >
                              Pagar
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => open({ kind: "edit-payment", payment: p })}
                              aria-label={`Editar importe de ${p.title}`}
                            >
                              Editar importe
                            </Button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <MobilePayments payments={payments} asOf={snapshot.asOf} open={open} />
          </>
        ) : (
          <Empty
            icon={CalendarDays}
            title={
              filter === "previous"
                ? "No quedan pagos de meses anteriores."
                : filter === "paid"
                  ? "Todavía no registraste pagos en este mes."
                  : filter === "all"
                    ? "No hay vencimientos en este mes."
                    : "Sin vencimientos pendientes en este mes."
            }
          >
            {filter === "previous"
              ? "Los pagos silenciados también aparecen aquí hasta que los registres como pagados."
              : "La lista muestra sólo los vencimientos del mes elegido. Cambiá de mes o agregá un pago."}
          </Empty>
        )}
      </section>
      <p className="explanatory-note">
        <CircleHelp size={16} /> Los pagos recurrentes generan vencimientos individuales. Pagar uno
        no marca como pagados los siguientes. Si no tienen importe, lo completás al pagar. Silenciar
        un aviso tampoco paga ni cancela el vencimiento.
      </p>
    </>
  );
}
