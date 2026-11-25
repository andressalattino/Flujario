import { Link } from "react-router";
import {
  ArrowRight,
  ArrowUpRight,
  ArrowDownLeft,
  ArrowLeftRight,
  CalendarDays,
  Plus,
} from "lucide-react";
import type { Snapshot } from "~/domain/finance";
import { formatMoney } from "~/domain/money";
import { formatDate, frequencyLabels } from "~/domain/dates";
import type { Open } from "./types";
import { Button } from "../ui/button";

export function PendingOverview({
  snapshot,
  base,
  open,
}: {
  snapshot: Snapshot;
  base: string;
  open: Open;
}) {
  const pending = snapshot.payments
    .filter((payment) => !payment.paid && payment.dueDate.startsWith(snapshot.asOf.slice(0, 7)))
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.title.localeCompare(b.title, "es"));
  return (
    <section className="pending-overview" aria-labelledby="pending-overview-title">
      <div className="overview-section-top">
        <div>
          <span className="eyebrow">PARA TENER PRESENTE</span>
          <h2 id="pending-overview-title">Pagos de este mes</h2>
        </div>
        <span className="pending-count">{pending.length}</span>
      </div>
      <p className="overview-helper">Cada vencimiento se registra por separado.</p>
      {pending.length ? (
        <ul className="pending-overview-list">
          {pending.slice(0, 5).map((payment) => (
            <li key={payment.id}>
              <div
                className={`pending-date ${payment.dueDate < snapshot.asOf ? "is-overdue" : ""}`}
              >
                <strong>{payment.dueDate.slice(8)}</strong>
                <span>{formatDate(payment.dueDate).split(" ").at(-1)}</span>
              </div>
              <div className="pending-payment-info">
                <h3>{payment.title}</h3>
                <span>
                  {payment.dueDate < snapshot.asOf ? "Vencido · " : ""}
                  {frequencyLabels[payment.frequency]}
                </span>
                <strong>
                  {payment.amountMinor === null
                    ? "Completás el importe al pagar"
                    : `${formatMoney(payment.amountMinor, payment.currency)} ${payment.currency}`}
                </strong>
                {payment.amountMinor === null && (
                  <small>{payment.currency} · Sin importe definido</small>
                )}
              </div>
              <Button
                size="sm"
                variant="outline"
                aria-label={`Pagar ${payment.title}`}
                onClick={() => open({ kind: "pay", payment })}
              >
                Pagar
              </Button>
            </li>
          ))}
        </ul>
      ) : (
        <div className="overview-list-empty">
          <CalendarDays size={24} strokeWidth={1.3} />
          <h3>Un mes sin pendientes registrados.</h3>
          <p>Agregá impuestos o servicios para ver sus vencimientos acá.</p>
        </div>
      )}
      <div className="overview-list-foot">
        <Link className="text-link small" to={`${base}/pagos`}>
          Ver todos <ArrowUpRight size={13} />
        </Link>
        <Button variant="ghost" size="sm" onClick={() => open("payment")}>
          <Plus size={14} />
          Agregar pago
        </Button>
      </div>
    </section>
  );
}
export function RecentOverview({
  snapshot,
  base,
  open,
}: {
  snapshot: Snapshot;
  base: string;
  open: Open;
}) {
  const entries = snapshot.entries.filter((entry) => entry.date <= snapshot.asOf).slice(0, 5);
  return (
    <section className="recent-overview" aria-labelledby="recent-overview-title">
      <div className="overview-section-top">
        <div>
          <span className="eyebrow">EL RECORRIDO DE TU DINERO</span>
          <h2 id="recent-overview-title">Últimos movimientos</h2>
        </div>
        <Link to={`${base}/movimientos`} className="text-link small">
          Ver movimientos <ArrowUpRight size={14} />
        </Link>
      </div>
      {entries.length ? (
        <ul className="recent-activity">
          {entries.map((entry) => (
            <li key={entry.id}>
              <span className={`activity-icon ${entry.kind}`} aria-hidden="true">
                {entry.kind === "income" ? (
                  <ArrowDownLeft size={18} />
                ) : entry.kind === "expense" ? (
                  <ArrowUpRight size={18} />
                ) : (
                  <ArrowLeftRight size={18} />
                )}
              </span>
              <div className="activity-description">
                <h3>{entry.description}</h3>
                <span>
                  {entry.kind === "exchange"
                    ? "Cambio de moneda"
                    : entry.kind === "transfer"
                      ? "Transferencia"
                      : entry.category}{" "}
                  · {formatDate(entry.date, true)}
                </span>
              </div>
              <div className={`activity-amount ${entry.kind}`}>
                {entry.kind === "exchange" &&
                entry.targetAmountMinor != null &&
                entry.targetCurrency ? (
                  <>
                    <span>
                      − {formatMoney(entry.amountMinor, entry.currency)}{" "}
                      <small>{entry.currency}</small>
                    </span>
                    <ArrowRight size={13} aria-hidden="true" />
                    <span>
                      + {formatMoney(entry.targetAmountMinor, entry.targetCurrency)}{" "}
                      <small>{entry.targetCurrency}</small>
                    </span>
                  </>
                ) : (
                  <span>
                    {entry.kind === "income" ? "+ " : entry.kind === "expense" ? "− " : ""}
                    {formatMoney(entry.amountMinor, entry.currency)} <small>{entry.currency}</small>
                  </span>
                )}
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <div className="overview-list-empty">
          <ArrowLeftRight size={24} />
          <h3>Tu primer movimiento empieza acá.</h3>
          <p>Un ingreso o gasto alcanza para empezar a ordenar el mes.</p>
          <Button variant="outline" onClick={() => open("entry")}>
            Anotar movimiento
          </Button>
        </div>
      )}
      <p className="overview-helper">
        Todas tus monedas, identificadas. Los cambios de moneda no cuentan como ingresos ni gastos.
      </p>
    </section>
  );
}
