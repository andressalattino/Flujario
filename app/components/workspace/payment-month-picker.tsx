import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "../ui/button";
import { monthLabel, PAYMENT_MONTH_RANGE, shiftMonth } from "~/domain/payments";

export function PaymentMonthPicker({
  month,
  asOf,
  onChange,
}: {
  month: string;
  asOf: string;
  onChange: (month: string) => void;
}) {
  const current = asOf.slice(0, 7);
  const first = shiftMonth(current, -PAYMENT_MONTH_RANGE);
  const last = shiftMonth(current, PAYMENT_MONTH_RANGE);
  return (
    <section className="payment-month-picker" aria-label="Mes de los pagos">
      <div className="payment-month-navigation">
        <Button
          variant="outline"
          size="icon"
          aria-label="Ver mes anterior"
          disabled={month <= first}
          onClick={() => onChange(shiftMonth(month, -1))}
        >
          <ChevronLeft />
        </Button>
        <div className="payment-month-label" aria-live="polite" aria-atomic="true">
          <span className="eyebrow">PAGOS DEL MES</span>
          <h2>
            <time dateTime={`${month}-01`}>{monthLabel(month)}</time>
          </h2>
        </div>
        <Button
          variant="outline"
          size="icon"
          aria-label="Ver mes siguiente"
          disabled={month >= last}
          onClick={() => onChange(shiftMonth(month, 1))}
        >
          <ChevronRight />
        </Button>
      </div>
      <div className="payment-month-context">
        <Button
          size="sm"
          variant="ghost"
          disabled={month === current}
          onClick={() => onChange(current)}
        >
          Mes actual
        </Button>
        <span>Hasta 5 meses atrás y 5 adelante.</span>
      </div>
    </section>
  );
}
