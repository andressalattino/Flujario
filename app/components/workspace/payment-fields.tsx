import { useState } from "react";
import { Field, Select } from "./shared";
import type { PaymentModal } from "./types";
import { moneyInput, type Currency } from "~/domain/money";
import { formatDate, frequencyLabels } from "~/domain/dates";
import { currencyOptions, currencyInfo } from "~/domain/currencies";

export function NewPaymentFields({
  currency: initialCurrency,
  owned,
  asOf,
}: {
  currency: Currency;
  owned: Currency[];
  asOf: string;
}) {
  const [currency, setCurrency] = useState(initialCurrency);
  const [frequency, setFrequency] = useState("once");
  return (
    <>
      <input type="hidden" name="intent" value="payment" />
      <Field
        label="Nombre del pago"
        name="title"
        placeholder="Ej.: Electricidad"
        minLength={2}
        maxLength={120}
        required
      />
      <div className="form-row">
        <Field
          label="Importe de este vencimiento (opcional)"
          name="amount"
          placeholder={currency === "CLP" ? "Pesos enteros, sin decimales" : "Completar al pagar"}
          inputMode={currencyInfo[currency].digits ? "decimal" : "numeric"}
        />
        <Select
          label="Moneda"
          name="currency"
          value={currency}
          onChange={(event) => setCurrency(event.target.value as Currency)}
          options={currencyOptions(owned)}
        />
      </div>
      <div className="form-row">
        <Field label="Primer vencimiento" name="dueDate" type="date" defaultValue={asOf} required />
        <Select
          label="Se repite"
          name="frequency"
          value={frequency}
          onChange={(event) => setFrequency(event.target.value)}
          options={Object.entries(frequencyLabels)}
        />
      </div>
      {frequency !== "once" && (
        <label className="payment-amount-option">
          <input type="checkbox" name="keepAmount" value="yes" />
          <span>Mantener este importe para los siguientes vencimientos</span>
        </label>
      )}
      <p className="field-hint">
        {frequency === "once"
          ? "Podés dejar el importe vacío y completarlo al pagar. Siempre podés editar un pendiente."
          : "Si no mantenés el importe, los siguientes vencimientos aparecen sin monto y lo completás al pagar. Siempre podés editar un pendiente."}
      </p>
      {frequency !== "once" && (
        <p className="field-hint">
          Si el día no existe en un mes, se usa su último día. El próximo mes recupera el día
          original.
        </p>
      )}
    </>
  );
}

export function ExistingPaymentFields({ modal, asOf }: { modal: PaymentModal; asOf: string }) {
  const { payment, kind } = modal;
  const paying = kind === "pay";
  return (
    <>
      <input type="hidden" name="intent" value={kind} />
      <input type="hidden" name="occurrenceId" value={payment.id} />
      <input type="hidden" name="currency" value={payment.currency} />
      <div className="payment-confirmation">
        <span>{payment.title}</span>
        <small>
          Vence el {formatDate(payment.dueDate)} {payment.dueDate.slice(0, 4)} · {payment.currency}
        </small>
      </div>
      <Field
        label={`${paying ? "Importe que pagaste" : "Importe de este vencimiento (opcional)"} · ${payment.currency}`}
        name="amount"
        defaultValue={moneyInput(payment.amountMinor, payment.currency)}
        placeholder={payment.currency === "CLP" ? "Ej.: 32.000" : "Ej.: 32.000,00"}
        inputMode={currencyInfo[payment.currency].digits ? "decimal" : "numeric"}
        required={paying}
      />
      {!paying && (
        <p className="field-hint">
          Dejá el campo vacío si preferís completar el importe cuando lo pagues. Editar un pendiente
          no modifica tu saldo.
        </p>
      )}
      {paying && (
        <Field
          label="Fecha en que lo pagaste"
          name="date"
          type="date"
          defaultValue={asOf}
          max={asOf}
          required
        />
      )}
      {payment.frequency !== "once" ? (
        <>
          <Select
            label="Para los siguientes vencimientos"
            name="futureAmount"
            defaultValue="unchanged"
            options={[
              ["unchanged", "Dejar como están"],
              ["use", "Usar este importe"],
              ["clear", "Completar al pagar"],
            ]}
          />
          <p className="field-hint">
            Los meses que ya ajustaste manualmente y los pagos registrados se conservan. Este
            vencimiento queda con su propio importe.
          </p>
        </>
      ) : (
        <input type="hidden" name="futureAmount" value="unchanged" />
      )}
    </>
  );
}
