import { useId } from "react";
import { formatMoney } from "~/domain/money";
import type { FinancialReport } from "~/domain/assistant";
function FinancialChart({ report }: { report: FinancialReport }) {
  const id = useId(),
    rows = report.rows.filter(
      (r): r is typeof r & { amountMinor: number } => r.amountMinor !== null,
    );
  if (!rows.length || report.chart === "none") return null;
  if (report.chart === "line" && rows.length > 1) {
    const amounts = rows.map((r) => BigInt(r.amountMinor)),
      min = amounts.reduce((a, b) => (a < b ? a : b), 0n),
      max = amounts.reduce((a, b) => (a > b ? a : b), 0n),
      span = max - min || 1n;
    const points = amounts
      .map(
        (v, i) =>
          `${12 + (i * 276) / (rows.length - 1)},${92 - Number(((v - min) * 8000n) / span) / 100}`,
      )
      .join(" ");
    return (
      <figure className="chat-chart">
        <svg viewBox="0 0 300 110" role="img" aria-labelledby={id}>
          <title id={id}>{`${report.title}. Valores exactos en la tabla de detalle.`}</title>
          <line x1="12" x2="288" y1="92" y2="92" className="chat-chart-baseline" />
          <polyline
            points={points}
            fill="none"
            className="chat-chart-line"
            strokeWidth="2.5"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
          {amounts.map((v, i) => (
            <circle
              key={i}
              cx={12 + (i * 276) / (rows.length - 1)}
              cy={92 - Number(((v - min) * 8000n) / span) / 100}
              r="3"
              className="chat-chart-dot"
            />
          ))}
        </svg>
        <figcaption>
          {rows[0]!.label} — {rows.at(-1)!.label}
        </figcaption>
      </figure>
    );
  }
  const maximum = rows.reduce((m, r) => {
    const n = BigInt(Math.abs(r.amountMinor));
    return n > m ? n : m;
  }, 1n);
  return (
    <figure className="chat-chart chat-bars" aria-label={`${report.title}: gráfico de barras`}>
      {rows.slice(0, 8).map((r, i) => (
        <div className="chat-bar" key={i}>
          <div>
            <span>{r.label}</span>
            <strong>{formatMoney(r.amountMinor, report.currency)}</strong>
          </div>
          <div className="chat-bar-track" aria-hidden="true">
            <span
              style={{
                width: `${Number((BigInt(Math.abs(r.amountMinor)) * 10000n) / maximum) / 100}%`,
              }}
              className={r.amountMinor < 0 ? "is-negative" : ""}
            />
          </div>
        </div>
      ))}
      {rows.length > 8 && (
        <figcaption>Gráfico de las primeras ocho filas. El detalle incluye las demás.</figcaption>
      )}
    </figure>
  );
}
export function FinancialReportView({ report }: { report: FinancialReport }) {
  return (
    <article className="chat-report">
      <div className="chat-report-period">
        {report.currency} · {report.from} al {report.to}
      </div>
      <h3>{report.title}</h3>
      <p>{report.text}</p>
      {!!report.metrics.length && (
        <dl className="chat-metrics">
          {report.metrics.map((m, i) => (
            <div key={i}>
              <dt>{m.label}</dt>
              <dd>
                {m.amountMinor === null ? "A definir" : formatMoney(m.amountMinor, report.currency)}
              </dd>
              {m.detail && <p>{m.detail}</p>}
            </div>
          ))}
        </dl>
      )}
      <FinancialChart report={report} />
      {!!report.rows.length && (
        <details className="chat-report-table">
          <summary>Ver tabla de detalle · {report.rows.length} filas</summary>
          <div tabIndex={0} role="region" aria-label={`Detalle de ${report.title}`}>
            <table>
              <caption className="sr-only">
                {report.title}, importes en {report.currency}
              </caption>
              <thead>
                <tr>
                  <th scope="col">Concepto</th>
                  <th scope="col">Importe</th>
                </tr>
              </thead>
              <tbody>
                {report.rows.map((r, i) => (
                  <tr key={i}>
                    <th scope="row">
                      {r.label}
                      {r.detail && <small>{r.detail}</small>}
                    </th>
                    <td>
                      {r.amountMinor === null
                        ? "A definir"
                        : formatMoney(r.amountMinor, report.currency)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}
      <ul className="chat-report-notes">
        {report.notes.map((note, i) => (
          <li key={i}>{note}</li>
        ))}
      </ul>
    </article>
  );
}
