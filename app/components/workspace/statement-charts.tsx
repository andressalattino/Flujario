import { formatMoney, type Currency } from "~/domain/money";
import type { statementAnalysis } from "~/domain/statements";

type ChartData = Pick<ReturnType<typeof statementAnalysis>, "categories" | "periods" | "count">;

export function StatementCharts({ data, currency }: { data: ChartData; currency: Currency }) {
  if (!data.count) return <p>No hay movimientos en este período para graficar.</p>;
  const { categories, periods } = data;
  const categoryMaximum = maximumAbsolute(categories.map((category) => category.amountMinor));
  const periodMaximum = maximumAbsolute(
    periods.flatMap((period) => [period.income, period.expense]),
  );
  return (
    <div className="statement-charts">
      <div>
        <h4>En qué gastaste más</h4>
        <p className="field-hint">Los reintegros del detalle reducen su categoría.</p>
        {categories.map((c) => (
          <div className="statement-bar-row" key={c.category}>
            <div>
              <span>{c.category}</span>
              <strong>{formatMoney(c.amountMinor, currency)}</strong>
            </div>
            <div className="statement-bar-track">
              <span
                style={{
                  width: barWidth(c.amountMinor, categoryMaximum),
                }}
              />
            </div>
          </div>
        ))}
      </div>
      <div>
        <h4>Ingresos y egresos por período</h4>
        <p className="field-hint">Verde: ingresos · Naranja: egresos</p>
        {periods.map((p) => (
          <div className="statement-bar-row" key={p.period}>
            <div>
              <span>{p.period}</span>
              <span>
                {formatMoney(p.income, currency)} / {formatMoney(p.expense, currency)}
              </span>
            </div>
            <div className="statement-bar-track income">
              <span
                style={{
                  width: barWidth(p.income, periodMaximum),
                }}
              />
            </div>
            <div className="statement-bar-track expense">
              <span
                style={{
                  width: barWidth(p.expense, periodMaximum),
                }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function maximumAbsolute(values: number[]) {
  return BigInt(values.reduce((maximum, value) => Math.max(maximum, Math.abs(value)), 0));
}

function barWidth(value: number, max: bigint) {
  return `${max ? Number((BigInt(Math.abs(value)) * 10000n) / max) / 100 : 0}%`;
}
