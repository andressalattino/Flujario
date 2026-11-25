import { useEffect } from "react";
import { useRevalidator } from "react-router";
import { RefreshCw, CircleHelp } from "lucide-react";
import { Button } from "../ui/button";
import { quoteDefinitions, quoteSeries, quoteDate, type ExchangeQuote } from "~/domain/quotes";
import { today } from "~/domain/dates";
import { formatRate } from "~/domain/decimal";
import type { Snapshot } from "~/domain/finance";
export function Quotes({ snapshot, preview }: { snapshot: Snapshot; preview: boolean }) {
  const revalidator = useRevalidator();
  const { quotes, quoteState } = snapshot;
  useEffect(() => {
    const timer = window.setInterval(
      () => {
        const now = Date.now();
        const pending =
          quoteState.status === "refreshing" &&
          quoteState.lastAttemptAt &&
          now - Date.parse(quoteState.lastAttemptAt) < 30000;
        const expired = !quoteState.nextAttemptAt || now >= Date.parse(quoteState.nextAttemptAt);
        if (
          document.visibilityState === "visible" &&
          revalidator.state === "idle" &&
          (pending || expired)
        )
          revalidator.revalidate();
      },
      quoteState.status === "refreshing" ? 2000 : 60000,
    );
    return () => window.clearInterval(timer);
  }, [preview, quoteState, revalidator]);
  return (
    <>
      <div className="quote-toolbar">
        <div>
          <p className="eyebrow">PESOS ARGENTINOS POR UNIDAD</p>
          <p>
            {quoteState.lastAttemptAt
              ? `Última consulta: ${dateTime(quoteState.lastAttemptAt)} · Revisión cada 3 horas.`
              : "Todavía no hay una consulta registrada."}
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          disabled={revalidator.state !== "idle"}
          onClick={() => revalidator.revalidate()}
        >
          <RefreshCw size={15} />
          {revalidator.state === "idle" ? "Verificar referencias" : "Consultando…"}
        </Button>
      </div>
      {quoteState.status === "error" && (
        <p className="quote-warning" role="status">
          No pudimos actualizar las referencias. Si hay valores guardados, se muestran con su fecha.
          Podés registrar un cambio con cotización manual.
        </p>
      )}
      {quoteState.status === "partial" && (
        <p className="quote-warning" role="status">
          Algunas referencias no pudieron actualizarse. Revisá la fecha de cada valor.
        </p>
      )}
      {preview && (
        <p className="field-hint">
          Cotizaciones públicas actualizadas. Los saldos y movimientos de esta vista son de ejemplo.
        </p>
      )}
      <QuoteCards quotes={quotes} asOf={preview ? today() : snapshot.asOf} />
      <p className="explanatory-note">
        <CircleHelp size={16} /> Compra es lo que la fuente indica si vos vendés; venta, si vos
        comprás. Son referencias informativas: confirmá el precio y los montos reales al registrar
        tu cambio.
      </p>
      <p className="quote-attribution">
        Fuente:{" "}
        <a href="https://dolarapi.com" target="_blank" rel="noreferrer">
          DolarApi
        </a>{" "}
        ·{" "}
        <a
          href="https://ar.dolarapi.com/docs/argentina/operations/get-dolares"
          target="_blank"
          rel="noreferrer"
        >
          Fuentes de dólares
        </a>{" "}
        ·{" "}
        <a
          href="https://ar.dolarapi.com/docs/argentina/operations/get-cotizaciones"
          target="_blank"
          rel="noreferrer"
        >
          Fuentes de otras monedas
        </a>
      </p>
    </>
  );
}

const dateTime = (value: string) =>
  new Intl.DateTimeFormat("es-AR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "America/Argentina/Buenos_Aires",
  }).format(new Date(value));

export function QuoteCards({
  quotes,
  asOf,
  series = quoteSeries,
}: {
  quotes: ExchangeQuote[];
  asOf: string;
  series?: readonly ExchangeQuote["series"][];
}) {
  return (
    <section className="quote-grid" aria-label="Cotizaciones de monedas">
      {series.map((series) => {
        const definition = quoteDefinitions[series];
        const quote = quotes.find((item) => item.series === series);
        const previous = quote && quoteDate(quote) !== asOf;
        return (
          <article className="quote-card" key={series}>
            <div className="quote-card-heading">
              <h2>{definition.name}</h2>
              <span>{definition.currency} / ARS</span>
            </div>
            {quote ? (
              <>
                <dl className="quote-prices">
                  <div>
                    <dt>Compra</dt>
                    <dd>$ {formatRate(quote.buyRate)}</dd>
                  </div>
                  <div>
                    <dt>Venta</dt>
                    <dd>$ {formatRate(quote.sellRate)}</dd>
                  </div>
                </dl>
                <p className={previous ? "quote-previous" : "quote-date"}>
                  {previous ? "Referencia anterior · " : "Fuente · "}
                  {dateTime(quote.sourceAsOf)}
                </p>
              </>
            ) : (
              <div className="quote-empty">
                <p>Sin referencia disponible</p>
                <small>Podés ingresar una cotización manual al registrar un cambio.</small>
              </div>
            )}
          </article>
        );
      })}
    </section>
  );
}
