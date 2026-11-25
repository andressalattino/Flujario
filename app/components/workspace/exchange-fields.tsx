import { useEffect, useState } from "react";
import { useFetcher } from "react-router";
import { Field, Select } from "./shared";
import { currencyInfo, currencyOptions, type Currency } from "~/domain/currencies";
import { parseMoney, moneyInput, formatMoney } from "~/domain/money";
import { parseRate, rateInput } from "~/domain/decimal";
import { convertMinor, exchangePair } from "~/domain/exchange";
import {
  quoteDefinitions,
  quoteDate,
  quoteSide,
  quoteSeries,
  type ExchangeQuote,
  type QuoteState,
} from "~/domain/quotes";

export function ExchangeFields({
  owned,
  currency,
  asOf,
  quotes: initialQuotes,
  preview,
}: {
  owned: Currency[];
  currency: Currency;
  asOf: string;
  quotes: ExchangeQuote[];
  preview: boolean;
}) {
  const [from, setFrom] = useState(currency);
  const [to, setTo] = useState<Currency>(owned.find((code) => code !== currency) ?? "USD");
  const [amount, setAmount] = useState("");
  const [target, setTarget] = useState("");
  const [rate, setRate] = useState("");
  const [quoteId, setQuoteId] = useState("");
  const [date, setDate] = useState(asOf);
  const [hint, setHint] = useState("");
  const rates = useFetcher<{ quotes: ExchangeQuote[]; quoteState: QuoteState }>();
  useEffect(() => {
    if (!preview) rates.load("/app/cotizaciones/datos");
  }, [preview]);
  const quotes = rates.data?.quotes ?? initialQuotes;
  const pair = exchangePair(from, to);
  const references =
    from === "ARS" || to === "ARS"
      ? quoteSeries.flatMap((series) =>
          quotes.filter((quote) => quote.series === series && quote.currency === pair.base),
        )
      : [];
  const selected = quotes.find((quote) => quote.id === quoteId);
  let edited = false;
  try {
    edited = !!selected && parseRate(rate) !== quoteSide(selected, from);
  } catch {
    edited = !!selected && !!rate.trim();
  }
  function amountLabel(value: string, currency: Currency) {
    try {
      return `${formatMoney(parseMoney(value, currency), currency)} ${currency}`;
    } catch {
      return "Sin completar";
    }
  }
  function calculate(nextAmount: string, nextRate: string, source = from, destination = to) {
    setHint("");
    if (!nextAmount.trim() || !nextRate.trim()) {
      setTarget("");
      return;
    }
    try {
      setTarget(
        moneyInput(
          convertMinor(parseMoney(nextAmount, source), source, destination, parseRate(nextRate)),
          destination,
        ),
      );
    } catch (error) {
      setTarget("");
      setHint((error as Error).message);
    }
  }
  function changeCurrencies(source: Currency, destination: Currency) {
    setFrom(source);
    setTo(destination);
    setQuoteId("");
    setRate("");
    setTarget("");
    setHint("");
  }
  return (
    <>
      <input type="hidden" name="intent" value="exchange" />
      <input type="hidden" name="quoteId" value={quoteId} />
      <div className="form-row">
        <Select
          label="Moneda que entregaste"
          name="currency"
          value={from}
          onChange={(event) => {
            const source = event.target.value as Currency;
            changeCurrencies(source, source === to ? from : to);
            setAmount("");
          }}
          options={currencyOptions(owned)}
        />
        <Select
          label="Moneda que recibiste"
          name="targetCurrency"
          value={to}
          onChange={(event) => changeCurrencies(from, event.target.value as Currency)}
          options={currencyOptions(owned.filter((code) => code !== from))}
        />
      </div>
      <Field
        label="Fecha del cambio"
        name="date"
        type="date"
        value={date}
        max={asOf}
        required
        onChange={(event) => {
          setDate(event.target.value);
          if (quoteId) {
            setQuoteId("");
            setRate("");
            setTarget("");
          }
        }}
      />
      <Select
        label="Referencia para calcular"
        value={quoteId}
        onChange={(event) => {
          const id = event.target.value;
          setQuoteId(id);
          const quote = quotes.find((item) => item.id === id);
          if (quote) {
            const value = rateInput(quoteSide(quote, from));
            setRate(value);
            calculate(amount, value);
          }
        }}
        options={[
          ["", "Cotización manual"],
          ...(date === asOf
            ? references.map((quote) => [
                quote.id,
                `${quoteDefinitions[quote.series].name}${quoteDate(quote) === asOf ? "" : " (anterior)"}`,
              ])
            : []),
        ]}
      />
      {rates.state !== "idle" && (
        <p className="field-hint" role="status">
          Consultando referencias… Podés ingresar tu cotización.
        </p>
      )}
      {date !== asOf && (
        <p className="field-hint">Para otra fecha, ingresá la cotización que usaste.</p>
      )}
      {selected && (
        <p className="field-hint">
          DolarApi · Fecha de la fuente:{" "}
          {new Intl.DateTimeFormat("es-AR", {
            dateStyle: "short",
            timeStyle: "short",
            timeZone: "America/Argentina/Buenos_Aires",
          }).format(new Date(selected.sourceAsOf))}
          {quoteDate(selected) !== asOf ? " · Es una referencia anterior." : ""}{" "}
          {edited ? "Modificaste la cotización sugerida." : "Podés corregirla."}
        </p>
      )}
      <Field
        label={`Cotización: 1 ${pair.base} en ${pair.quote}`}
        name="rate"
        inputMode="decimal"
        value={rate}
        onChange={(event) => {
          setRate(event.target.value);
          calculate(amount, event.target.value);
        }}
        placeholder="Ej.: 1.500,25"
        required
      />
      <div className="form-row">
        <Field
          label={`Importe entregado · ${from}`}
          name="amount"
          inputMode={currencyInfo[from].digits ? "decimal" : "numeric"}
          value={amount}
          onChange={(event) => {
            setAmount(event.target.value);
            calculate(event.target.value, rate);
          }}
          required
        />
        <Field
          label={`Importe recibido · ${to}`}
          name="targetAmount"
          inputMode={currencyInfo[to].digits ? "decimal" : "numeric"}
          value={target}
          onChange={(event) => {
            setTarget(event.target.value);
            setHint("");
          }}
          required
        />
      </div>
      {hint && (
        <p className="field-hint" role="status">
          {hint}
        </p>
      )}
      <p className="field-hint">
        La cotización calcula una sugerencia. Corregí el importe recibido si fue distinto: se
        guardan los dos montos que confirmes.
      </p>
      <div className="exchange-review" aria-live="polite">
        <span>Tu registro</span>
        <strong>
          {from} → {to}
        </strong>
        <dl>
          <div>
            <dt>Entregaste</dt>
            <dd>{amountLabel(amount, from)}</dd>
          </div>
          <div>
            <dt>Recibiste</dt>
            <dd>{amountLabel(target, to)}</dd>
          </div>
        </dl>
        <p>
          Sale de {from} y entra en {to}. No se cuenta como ingreso ni gasto.
        </p>
      </div>
    </>
  );
}
