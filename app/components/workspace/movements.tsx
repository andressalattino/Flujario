import { Search, ArrowLeftRight } from "lucide-react";
import { Input } from "../ui/input";
import { Empty, EntriesTable } from "./shared";
import type { Open } from "./types";
import { entryAffectsCurrency, type Snapshot } from "~/domain/finance";
import type { Currency } from "~/domain/money";
import { lazy, Suspense } from "react";
const StatementTools = lazy(() => import("./statement-tools"));
export function Movements({
  snapshot,
  currency,
  query,
  kind,
  updateParam,
  open,
  preview,
}: {
  snapshot: Snapshot;
  currency: Currency;
  query: string;
  kind: string;
  updateParam: (key: string, value: string) => void;
  open: Open;
  preview: boolean;
}) {
  const entries = snapshot.entries.filter(
    (e) =>
      entryAffectsCurrency(e, currency) &&
      (kind === "all" || e.kind === kind) &&
      `${e.description} ${e.category}`.toLowerCase().includes(query.toLowerCase()),
  );
  return (
    <>
      <Suspense fallback={<p role="status">Preparando herramientas de resúmenes…</p>}>
        <StatementTools snapshot={snapshot} currency={currency} preview={preview} />
      </Suspense>
      <section className="data-panel">
        <div className="list-filters">
          <div className="search-field">
            <Search size={17} />
            <Input
              aria-label="Buscar movimientos"
              value={query}
              onChange={(e) => updateParam("q", e.target.value)}
              placeholder="Buscar un movimiento…"
            />
          </div>
          <label className="filter-select">
            <span className="sr-only">Tipo de movimiento</span>
            <select value={kind} onChange={(e) => updateParam("tipo", e.target.value)}>
              <option value="all">Todos los movimientos</option>
              <option value="expense">Gastos</option>
              <option value="income">Ingresos</option>
              <option value="exchange">Cambios de moneda</option>
            </select>
          </label>
        </div>
        {entries.length ? (
          <EntriesTable entries={entries} currency={currency} />
        ) : (
          <Empty
            icon={ArrowLeftRight}
            title={
              snapshot.entries.some((e) => entryAffectsCurrency(e, currency))
                ? "No encontramos coincidencias."
                : "Una historia por empezar."
            }
          >
            {snapshot.entries.some((e) => entryAffectsCurrency(e, currency)) ? (
              "Probá con otra búsqueda o cambiá el filtro."
            ) : (
              <>
                Tu saldo inicial ya está listo.{" "}
                <button className="text-link" onClick={() => open("entry")}>
                  Anotá el primer movimiento.
                </button>
              </>
            )}
          </Empty>
        )}
        <div className="table-footer">
          {entries.length} {entries.length === 1 ? "movimiento" : "movimientos"} · {currency}
        </div>
      </section>
    </>
  );
}
