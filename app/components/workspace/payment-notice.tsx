import { BellRing, ArrowUpRight } from "lucide-react";
import { Link } from "react-router";
import { paymentTotals, type Snapshot } from "~/domain/finance";
import { currencies, formatMoney } from "~/domain/money";
import { visiblePaymentNotices } from "~/domain/payments";
import { Button } from "../ui/button";

export function PaymentNotice({
  snapshot,
  base,
  busy,
  onDismiss,
  onLater,
}: {
  snapshot: Snapshot;
  base: string;
  busy: boolean;
  onDismiss: () => void;
  onLater: () => void;
}) {
  const payments = visiblePaymentNotices(
    snapshot.payments,
    snapshot.asOf,
    snapshot.dismissedPaymentIds,
  );
  if (!payments.length) return null;
  const groups = currencies
    .map((currency) => ({
      currency,
      payments: payments.filter((payment) => payment.currency === currency),
    }))
    .filter((group) => group.payments.length);
  return (
    <section className="payment-notice" aria-labelledby="payment-notice-title">
      <BellRing size={21} strokeWidth={1.5} aria-hidden="true" />
      <div className="payment-notice-content">
        <div role="status">
          <h2 id="payment-notice-title">Quedaron pagos de meses anteriores.</h2>
          <p>
            Tenés {payments.length}{" "}
            {payments.length === 1
              ? "vencimiento sin registrar como pagado"
              : "vencimientos sin registrar como pagados"}
            . Los importes siguen pendientes.
          </p>
        </div>
        <div className="payment-notice-links">
          {groups.map((group) => {
            const totals = paymentTotals(group.payments);
            return (
              <Link
                key={group.currency}
                className="text-link"
                to={`${base}/pagos?moneda=${group.currency}&estado=previous`}
              >
                Revisar {group.currency} · {formatMoney(totals.knownMinor, group.currency)}
                {totals.unknownCount ? ` conocidos + ${totals.unknownCount} sin importe` : ""}{" "}
                <ArrowUpRight size={14} />
              </Link>
            );
          })}
        </div>
        <div className="payment-notice-actions">
          <Button size="sm" variant="outline" onClick={onLater} disabled={busy}>
            Recordar más tarde
          </Button>
          <Button size="sm" variant="ghost" onClick={onDismiss} disabled={busy}>
            {busy ? "Guardando…" : "No volver a mostrar"}
          </Button>
        </div>
        <p className="payment-notice-help">
          Recordar más tarde lo oculta durante esta visita. No volver a mostrar silencia estos
          vencimientos; no los paga ni silencia los futuros.
        </p>
      </div>
    </section>
  );
}
