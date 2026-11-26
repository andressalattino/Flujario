import { useState } from "react";
import { Field, Select } from "./shared";
import {
  availableCurrencies,
  currencyInfo,
  currencyOptions,
  type Currency,
} from "~/domain/currencies";
import { categories } from "~/data/categories";
import type { Entry } from "~/domain/finance";
import { moneyInput } from "~/domain/money";
export function AddCurrencyFields({ owned, asOf }: { owned: Currency[]; asOf: string }) {
  const available = availableCurrencies(owned);
  const [currency, setCurrency] = useState(available[0] ?? "EUR");
  if (!available.length) return <p>Ya agregaste todas las monedas disponibles.</p>;
  return (
    <>
      <input type="hidden" name="intent" value="add-currency" />
      <Select
        label="Moneda para agregar"
        name="currency"
        value={currency}
        onChange={(event) => setCurrency(event.target.value as Currency)}
        options={currencyOptions(available)}
      />
      <Field
        label={`Saldo inicial en ${currency} (opcional)`}
        name="opening"
        defaultValue="0"
        inputMode={currencyInfo[currency].digits ? "decimal" : "numeric"}
      />
      <p className="field-hint">
        Podés comenzar en cero. El saldo inicial no se cuenta como ingreso.
      </p>
      <Field
        label="Fecha del saldo inicial (inicio del día)"
        name="openingDate"
        type="date"
        defaultValue={asOf}
        max={asOf}
        required
      />
      {currency === "CLP" && (
        <p className="field-hint">Los pesos chilenos se ingresan sin decimales.</p>
      )}
    </>
  );
}
export function EntryFields({
  owned,
  currency: initial,
  asOf,
  expense,
}: {
  owned: Currency[];
  currency: Currency;
  asOf: string;
  expense?: Entry;
}) {
  const [currency, setCurrency] = useState(expense?.currency ?? initial);
  return (
    <>
      <input type="hidden" name="intent" value={expense ? "edit-expense" : "entry"} />
      {expense ? (
        <>
          <input type="hidden" name="entryId" value={expense.id} />
          <input type="hidden" name="currency" value={expense.currency} />
        </>
      ) : (
        <div className="form-row">
          <Select
            label="Tipo de movimiento"
            name="kind"
            options={[
              ["expense", "Gasto"],
              ["income", "Ingreso"],
            ]}
          />
          <Select
            label="Moneda"
            name="currency"
            value={currency}
            onChange={(event) => setCurrency(event.target.value as Currency)}
            options={currencyOptions(owned)}
          />
        </div>
      )}
      <Field
        label={`Importe · ${currency}`}
        name="amount"
        placeholder={currency === "CLP" ? "Ej.: 15.000" : "Ej.: 1.234,56"}
        inputMode={currencyInfo[currency].digits ? "decimal" : "numeric"}
        defaultValue={expense ? moneyInput(expense.amountMinor, currency) : undefined}
        readOnly={expense?.imported}
        required
      />
      {currency === "CLP" && !expense?.imported && (
        <p className="field-hint">Ingresá pesos chilenos enteros, sin decimales.</p>
      )}
      <Field
        label="Descripción"
        name="description"
        placeholder="Ej.: Supermercado"
        defaultValue={expense?.description}
        minLength={2}
        maxLength={120}
        required
      />
      <div className="form-row">
        <Select
          label="Categoría"
          name="category"
          defaultValue={expense?.category ?? "Otros"}
          options={categories.map((category) => [category, category])}
        />
        <Field
          label="Fecha del movimiento"
          name="date"
          type="date"
          defaultValue={expense?.date ?? asOf}
          readOnly={expense?.imported}
          max={asOf}
          required
        />
      </div>
    </>
  );
}
