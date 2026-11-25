import { ArrowDownLeft, ArrowUpRight, Wallet } from "lucide-react";
import { Link } from "react-router";
import { summarize, type Snapshot } from "~/domain/finance";
import { formatMoney } from "~/domain/money";

export type BalanceView = "ars" | "usd" | "both";
export const balanceView = (value: string | null): BalanceView =>
  value === "ars" || value === "usd" ? value : "both";
export function BalanceFocus({
  snapshot,
  view,
  onView,
  base,
  illustration = false,
}: {
  snapshot: Snapshot;
  view: BalanceView;
  onView: (view: BalanceView) => void;
  base: string;
  illustration?: boolean;
}) {
  const currencies =
    view === "both" ? (["ARS", "USD"] as const) : ([view === "ars" ? "ARS" : "USD"] as const);
  return (
    <section className={`balance-focus balance-view-${view}`} aria-labelledby="balance-focus-title">
      <div className="balance-focus-top">
        <div>
          <span className="eyebrow">LO QUE TENÉS HOY</span>
          <h2 id="balance-focus-title">Tus saldos, a la vista.</h2>
        </div>
        <Wallet size={23} strokeWidth={1.3} />
      </div>
      <div className="balance-view-controls" aria-label="Saldos visibles">
        {(
          [
            ["ars", "Pesos"],
            ["usd", "Dólares"],
            ["both", "Ambos"],
          ] as const
        ).map(([value, label]) => (
          <button key={value} onClick={() => onView(value)} aria-pressed={view === value}>
            {label}
          </button>
        ))}
      </div>
      <div className="balance-amounts">
        {currencies.map((currency) => {
          const summary = summarize(snapshot, currency);
          return (
            <div className="balance-currency" key={currency}>
              <span className="balance-currency-label">
                {currency === "ARS" ? "Pesos argentinos" : "Dólares estadounidenses"}{" "}
                <span>{currency}</span>
              </span>
              <strong className="balance-total">{formatMoney(summary.balance, currency)}</strong>
              <div className="balance-month-flow">
                <span className="flow-income">
                  <ArrowDownLeft size={13} />
                  <span>
                    Ingresos del mes<strong>{formatMoney(summary.income, currency)}</strong>
                  </span>
                </span>
                <span className="flow-expense">
                  <ArrowUpRight size={13} />
                  <span>
                    Gastos del mes<strong>{formatMoney(summary.expenses, currency)}</strong>
                  </span>
                </span>
              </div>
              <p className="balance-projection">
                {summary.projected === null
                  ? `Proyección incompleta · ${summary.unknownCount} pago${summary.unknownCount === 1 ? "" : "s"} sin importe.`
                  : `Proyección a fin de mes: ${formatMoney(summary.projected, currency)} ${currency}.`}
              </p>
            </div>
          );
        })}
      </div>
      <div className="balance-focus-foot">
        <span>Según tus registros. Cada moneda se mantiene separada.</span>
        {!illustration &&
          snapshot.accounts.some(
            (account) => account.currency !== "ARS" && account.currency !== "USD",
          ) && (
            <Link to={`${base}/movimientos`}>
              Ver otras monedas <ArrowUpRight size={13} />
            </Link>
          )}
      </div>
    </section>
  );
}
