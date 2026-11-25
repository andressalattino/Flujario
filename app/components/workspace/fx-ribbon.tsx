import { useEffect } from "react";
import { useFetcher, Link, useRevalidator } from "react-router";
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import type { Snapshot } from "~/domain/finance";
import { formatRate } from "~/domain/decimal";
import { quoteChange } from "~/domain/quote-change";
import { type QuoteSeries } from "~/domain/quotes";
import { formatFullDate } from "~/domain/dates";

export function FxRibbon({
  snapshot,
  base,
  preview,
  dollar,
  onDollar,
}: {
  snapshot: Snapshot;
  base: string;
  preview: boolean;
  dollar: QuoteSeries;
  onDollar: (series: QuoteSeries) => void;
}) {
  const fetcher = useFetcher<Pick<Snapshot, "quotes" | "previousQuotes" | "quoteState">>();
  const revalidator = useRevalidator();
  const data = fetcher.data ?? snapshot;
  useEffect(() => {
    if (!preview) fetcher.load("/app/cotizaciones/datos");
  }, [preview]);
  useEffect(() => {
    const refresh = () => {
      const pending =
        data.quoteState.status === "refreshing" &&
        data.quoteState.lastAttemptAt &&
        Date.now() - Date.parse(data.quoteState.lastAttemptAt) < 30000;
      if (
        document.visibilityState === "visible" &&
        fetcher.state === "idle" &&
        revalidator.state === "idle" &&
        (pending ||
          !data.quoteState.nextAttemptAt ||
          Date.now() >= Date.parse(data.quoteState.nextAttemptAt))
      ) {
        if (preview) revalidator.revalidate();
        else fetcher.load("/app/cotizaciones/datos");
      }
    };
    const timer = window.setInterval(() => {
      refresh();
    }, 60000);
    window.addEventListener("focus", refresh);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", refresh);
    };
  }, [preview, data.quoteState, fetcher.state, revalidator.state]);
  const definitions: [QuoteSeries, string, string][] = [
    [dollar, "USD", "Dólar"],
    ["eur", "EUR", "Euro"],
    ["brl", "BRL", "Real"],
    ["clp", "CLP", "Peso chileno"],
    ["uyu", "UYU", "Peso uruguayo"],
  ];
  return (
    <section className="fx-ribbon" aria-label="Cinco divisas de referencia">
      <div className="fx-heading">
        <div>
          <span className="eyebrow">DIVISAS EN UN VISTAZO</span>
          <p>Venta · Pesos argentinos por unidad</p>
        </div>
        <label>
          Dólar
          <select
            aria-label="Referencia del dólar en Resumen"
            value={dollar}
            onChange={(event) => onDollar(event.target.value as QuoteSeries)}
          >
            <option value="usd-oficial">Oficial</option>
            <option value="usd-mep">MEP</option>
            <option value="usd-blue">Blue</option>
          </select>
        </label>
        <Link className="text-link small" to={`${base}/cotizaciones`}>
          Ver cotizaciones <ArrowUpRight size={13} />
        </Link>
      </div>
      <div className="fx-items">
        {definitions.map(([series, code, name]) => {
          const quote = data.quotes.find((item) => item.series === series);
          const change = quote
            ? quoteChange(
                quote,
                data.previousQuotes?.find((item) => item.series === series),
              )
            : null;
          return (
            <article key={series} className="fx-item">
              <div>
                <strong>{code}</strong>
                <span>{name}</span>
              </div>
              <p className="fx-value">
                {quote ? `$ ${formatRate(quote.sellRate)}` : "Sin referencia"}
              </p>
              <p className={`fx-change ${change?.direction ?? "unknown"}`}>
                {change?.direction === "up" ? (
                  <ArrowUpRight size={13} />
                ) : change?.direction === "down" ? (
                  <ArrowDownRight size={13} />
                ) : (
                  <Minus size={13} />
                )}{" "}
                {change
                  ? `${change.direction === "up" ? "Subió" : change.direction === "down" ? "Bajó" : "Sin cambio"} ${change.percent}`
                  : "Sin comparación"}
              </p>
              {quote && (
                <time className="fx-date" dateTime={quote.sourceAsOf}>
                  Fuente · {formatFullDate(quote.sourceAsOf)}
                </time>
              )}
              {change && (
                <small className="fx-comparison">
                  vs. referencia del {formatFullDate(change.comparedDate)}
                </small>
              )}
            </article>
          );
        })}
      </div>
      <p className="fx-footnote">
        Fuente:{" "}
        <a href="https://dolarapi.com" target="_blank" rel="noreferrer">
          DolarApi
        </a>
        .{" "}
        {fetcher.state !== "idle" || revalidator.state !== "idle"
          ? "Consultando referencias…"
          : data.quoteState.status === "error" || data.quoteState.status === "partial"
            ? "La actualización fue incompleta; revisá las fechas."
            : "Revisión cada 3 horas."}{" "}
        {preview && "Referencias públicas de DolarApi; los saldos del panel son ficticios. "}
        La comparación usa la última referencia guardada de una fecha anterior; no representa un
        cierre oficial.
      </p>
    </section>
  );
}
