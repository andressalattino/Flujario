import { ArrowRight, ChartColumn } from "lucide-react";
import { Form, Link, useNavigation } from "react-router";
import { currencyOptions, type Currency } from "~/domain/currencies";
import { formatFullDate } from "~/domain/dates";
import { formatMoney } from "~/domain/money";
import {
  statisticsGroups,
  type StatisticsPageData,
  type StatisticsReport,
} from "~/domain/statistics";
import { Button } from "../ui/button";
import { Empty, Field, Select } from "./shared";
import "~/statistics.css";

const groupLabels = { month: "Mes", quarter: "Trimestre", year: "Año" };

function resultMoney(value: number, currency: Currency) {
  return `${value > 0 ? "+" : ""}${formatMoney(value, currency)}`;
}

function barSize(value: number, max: number) {
  return `${max ? (Math.abs(value) / max) * 100 : 0}%`;
}

function Highlight({
  title,
  value,
  currency,
  signed = false,
}: {
  title: string;
  value: StatisticsReport["bestPeriod"];
  currency: Currency;
  signed?: boolean;
}) {
  return (
    <div>
      <dt>{title}</dt>
      <dd>{value?.label ?? "Sin egresos"}</dd>
      {value && (
        <dd className="statistics-highlight-value">
          {signed
            ? resultMoney(value.amountMinor, currency)
            : formatMoney(value.amountMinor, currency)}
          {value.ties > 0 && <small>Empate con {value.ties} más</small>}
        </dd>
      )}
    </div>
  );
}

function PeriodChart({
  periods,
  currency,
  result = false,
}: {
  periods: StatisticsReport["periods"];
  currency: Currency;
  result?: boolean;
}) {
  const limit = periods.reduce(
    (largest, period) =>
      result
        ? Math.max(largest, Math.abs(period.net))
        : Math.max(largest, period.income, period.expense),
    0,
  );
  const title = result ? "Evolución del resultado" : "Ingresos y egresos por período";
  return (
    <figure
      className={`statistics-panel ${result ? "statistics-result" : "statistics-comparison"}`}
    >
      <figcaption>
        <h2>{title}</h2>
        {result ? (
          <p>Ingresos menos egresos. La línea del centro marca el cero.</p>
        ) : (
          <ul className="statistics-legend" aria-label="Referencias del gráfico">
            <li className="statistics-income">Ingresos</li>
            <li className="statistics-expense">Egresos</li>
          </ul>
        )}
      </figcaption>
      <div
        className="statistics-plot-scroll"
        role="region"
        aria-label={`${title}. Vista desplazable`}
        tabIndex={0}
      >
        <div className="statistics-period-plot" aria-hidden="true">
          {periods.map((period) => (
            <div className="statistics-plot-period" key={period.period}>
              {result ? (
                <div
                  className="statistics-result-bars"
                  title={`${period.label} · ${resultMoney(period.net, currency)}`}
                >
                  <div>
                    {period.net >= 0 && (
                      <span
                        className="statistics-bar statistics-income"
                        style={{ height: barSize(period.net, limit) }}
                      />
                    )}
                  </div>
                  <div>
                    {period.net < 0 && (
                      <span
                        className="statistics-bar statistics-expense"
                        style={{ height: barSize(period.net, limit) }}
                      />
                    )}
                  </div>
                </div>
              ) : (
                <div className="statistics-paired-bars">
                  <span
                    className="statistics-bar statistics-income"
                    style={{ height: barSize(period.income, limit) }}
                    title={`${period.label} · Ingresos ${formatMoney(period.income, currency)}`}
                  />
                  <span
                    className="statistics-bar statistics-expense"
                    style={{ height: barSize(period.expense, limit) }}
                    title={`${period.label} · Egresos ${formatMoney(period.expense, currency)}`}
                  />
                </div>
              )}
              <span className="statistics-period-label">{period.label}</span>
            </div>
          ))}
        </div>
      </div>
    </figure>
  );
}

export function Statistics({
  data,
  currencies,
  asOf,
  base,
}: {
  data: StatisticsPageData;
  currencies: Currency[];
  asOf: string;
  base: string;
}) {
  const { query, report, error } = data;
  const { currency, from, to, group } = query;
  const navigation = useNavigation();
  const applying =
    navigation.state !== "idle" && navigation.location?.pathname === `${base}/estadisticas`;
  const categoryMax =
    report?.categories.reduce((max, item) => Math.max(max, Math.abs(item.amountMinor)), 0) ?? 0;
  return (
    <div className="statistics-page">
      <Form
        key={`${currency}/${from}/${to}/${group}`}
        className="statistics-filters"
        method="get"
        replace
        preventScrollReset
      >
        <Select
          label="Moneda"
          name="moneda"
          defaultValue={currency}
          options={currencyOptions(currencies)}
        />
        <Field
          label="Desde"
          name="desde"
          type="date"
          defaultValue={from}
          min="1900-01-01"
          max={asOf}
          required
        />
        <Field
          label="Hasta"
          name="hasta"
          type="date"
          defaultValue={to}
          min="1900-01-01"
          max={asOf}
          required
        />
        <Select
          label="Agrupar por"
          name="agrupar"
          defaultValue={group}
          options={statisticsGroups.map((item) => [item, groupLabels[item]])}
        />
        <Button type="submit" disabled={applying}>
          {applying ? "Aplicando…" : "Aplicar"}
        </Button>
        <Link
          className="statistics-reset"
          to={`${base}/estadisticas?moneda=${currency}`}
          preventScrollReset
        >
          Últimos 12 meses
        </Link>
      </Form>
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
      {report && (
        <>
          <p className="statistics-range" role="status">
            <strong>{currency}</strong>
            <span>
              {formatFullDate(from)} – {formatFullDate(to)}
            </span>
          </p>
          {report.count === 0 ? (
            <Empty icon={ChartColumn} title="Todavía no hay datos para este período">
              Probá otro rango o revisá tus{" "}
              <Link to={`${base}/movimientos?moneda=${currency}`}>
                movimientos <ArrowRight size={14} aria-hidden="true" />
              </Link>
              .
            </Empty>
          ) : (
            <>
              <dl className="statistics-totals" aria-label="Totales del rango">
                <div className="statistics-income">
                  <dt>Ingresos</dt>
                  <dd>{formatMoney(report.income, currency)}</dd>
                </div>
                <div className="statistics-expense">
                  <dt>Egresos</dt>
                  <dd>{formatMoney(report.expense, currency)}</dd>
                </div>
                <div>
                  <dt>Resultado</dt>
                  <dd>{resultMoney(report.net, currency)}</dd>
                </div>
              </dl>
              <dl className="statistics-highlights" aria-label="Indicadores del rango">
                <Highlight
                  title="Mayor gasto por categoría"
                  value={report.mostSpentCategory}
                  currency={currency}
                />
                <Highlight
                  title="Menor gasto por categoría"
                  value={report.leastSpentCategory}
                  currency={currency}
                />
                <Highlight
                  title="Período de mayor gasto"
                  value={report.mostSpentPeriod}
                  currency={currency}
                />
                <Highlight
                  title="Mejor resultado"
                  value={report.bestPeriod}
                  currency={currency}
                  signed
                />
                <Highlight
                  title="Peor resultado"
                  value={report.worstPeriod}
                  currency={currency}
                  signed
                />
              </dl>
              {report.periods.length === 1 && (
                <p className="statistics-method">
                  Hay un solo período con movimientos. Podés ampliar el rango o elegir una
                  agrupación más corta para comparar.
                </p>
              )}
              <div className="statistics-chart-layout">
                <PeriodChart periods={report.periods} currency={currency} />
                <section
                  className="statistics-panel statistics-categories"
                  aria-labelledby="statistics-categories"
                >
                  <h2 id="statistics-categories">Gastos por categoría</h2>
                  {report.categories.length === 0 ? (
                    <p>En este rango sólo hay ingresos registrados.</p>
                  ) : (
                    <ul>
                      {report.categories.map(({ category, amountMinor }) => (
                        <li key={category}>
                          <div>
                            <span>{category}</span>
                            <strong>{formatMoney(amountMinor, currency)}</strong>
                          </div>
                          <div className="statistics-category-track" aria-hidden="true">
                            <span
                              className={amountMinor > 0 ? "statistics-expense" : ""}
                              style={{ width: barSize(amountMinor, categoryMax) }}
                            />
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
                <PeriodChart periods={report.periods} currency={currency} result />
              </div>
              <details className="statistics-details">
                <summary>Ver importes por período</summary>
                <div
                  className="statistics-plot-scroll"
                  role="region"
                  aria-label="Importes por período. Tabla desplazable"
                  tabIndex={0}
                >
                  <table>
                    <thead>
                      <tr>
                        <th scope="col">Período</th>
                        <th scope="col">Ingresos</th>
                        <th scope="col">Egresos</th>
                        <th scope="col">Resultado</th>
                      </tr>
                    </thead>
                    <tbody>
                      {report.periods.map((period) => (
                        <tr key={period.period}>
                          <th scope="row">{period.label}</th>
                          <td>{formatMoney(period.income, currency)}</td>
                          <td>{formatMoney(period.expense, currency)}</td>
                          <td>{resultMoney(period.net, currency)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </details>
              <p className="statistics-method">
                Se muestran períodos con movimientos registrados dentro de las fechas elegidas. El
                primero y el último pueden estar incompletos. El resultado es ingresos menos
                egresos.
              </p>
            </>
          )}
        </>
      )}
    </div>
  );
}
