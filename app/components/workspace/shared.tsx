import type { ComponentProps, ReactNode } from "react";
import { Wallet, ArrowUpRight, ArrowDownLeft, ArrowLeftRight } from "lucide-react";
import { Input } from "../ui/input";
import { entryDisplay, type Snapshot } from "~/domain/finance";
import { formatMoney, type Currency } from "~/domain/money";
import { EntryRate } from "./entry-rate";
import { formatDate } from "~/domain/dates";
import { MobileEntries } from "./mobile-data";
export function Field({
  label,
  name,
  ...props
}: ComponentProps<typeof Input> & { label: string; name: string }) {
  return (
    <label className="field">
      <span>{label}</span>
      <Input name={name} {...props} />
    </label>
  );
}
export function Select({
  label,
  options,
  ...props
}: ComponentProps<"select"> & { label: string; options: string[][] }) {
  return (
    <label className="field">
      <span>{label}</span>
      <select {...props}>
        {options.map(([value, title]) => (
          <option key={value} value={value}>
            {title}
          </option>
        ))}
      </select>
    </label>
  );
}
export function Empty({
  icon: Icon = Wallet,
  title,
  children,
}: {
  icon?: typeof Wallet;
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="empty-state">
      <Icon size={28} strokeWidth={1.2} />
      <h3>{title}</h3>
      <p>{children}</p>
    </div>
  );
}
export function EntriesTable({
  entries,
  currency,
}: {
  entries: Snapshot["entries"];
  currency: Currency;
}) {
  if (!entries.length)
    return (
      <Empty title="Tu primer movimiento empieza acá.">
        Anotá un ingreso o gasto. Vamos a mantener tus monedas separadas y tus cuentas claras.
      </Empty>
    );
  return (
    <>
      <div className="table-scroll desktop-data-table">
        <table className="finance-table">
          <thead>
            <tr>
              <th>Movimiento</th>
              <th>Categoría</th>
              <th>Fecha</th>
              <th className="text-right">Importe</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((e) => {
              const display = entryDisplay(e, currency);
              return (
                <tr key={e.id}>
                  <td>
                    <div className="transaction-name">
                      <span className={`transaction-icon ${e.kind}`}>
                        {e.kind === "income" ? (
                          <ArrowDownLeft size={17} />
                        ) : e.kind === "transfer" || e.kind === "exchange" ? (
                          <ArrowLeftRight size={17} />
                        ) : (
                          <ArrowUpRight size={17} />
                        )}
                      </span>
                      <div>
                        {e.description}
                        <small className={`movement-kind ${e.kind}`}>
                          {display.label}
                          {e.occurrenceId ? " · Pago registrado" : ""}
                        </small>
                        <EntryRate entry={e} />
                      </div>
                    </div>
                  </td>
                  <td>
                    <span className="category-tag">{e.category}</span>
                  </td>
                  <td className="muted-cell">
                    {formatDate(e.date)}
                    <small className="table-year">{e.date.slice(0, 4)}</small>
                  </td>
                  <td className={`amount-cell movement-amount ${e.kind}`}>
                    {display.sign}
                    {formatMoney(display.amountMinor, display.currency)}
                    <small>{display.currency}</small>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <MobileEntries entries={entries} currency={currency} />
    </>
  );
}
