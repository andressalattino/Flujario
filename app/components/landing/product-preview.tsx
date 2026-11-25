import { BalanceFocus } from "../workspace/balance-focus";
import { EntriesTable } from "../workspace/shared";
import { MobilePayments } from "../workspace/mobile-data";
import { QuoteCards } from "../workspace/quotes";
import { productExample } from "~/data/product-example";
import { paymentsInMonth } from "~/domain/payments";
import { BrandArtwork } from "../brand-artwork";
import { Search, Star, FileCheck2 } from "lucide-react";
import catalog from "~/data/stock-catalog.json";
import { FinancialReportView } from "../assistant/financial-chart";
import { createFinancialReport } from "~/domain/assistant-analysis";
import { presetPlan } from "~/domain/assistant";
import { emptyStatementState } from "~/domain/statements";
import { NewsArtwork } from "../workspace/news-artwork";
import "~/assistant.css";
import "~/news.css";

export type PreviewKind =
  | "resumen"
  | "movimientos"
  | "pagos"
  | "cotizaciones"
  | "mercados"
  | "importacion"
  | "asistente"
  | "noticias";
const descriptions: Record<PreviewKind, string> = {
  resumen:
    "Ejemplo de Resumen: saldos en ARS y USD separados, ingresos en verde, gastos en naranja y proyección incompleta cuando falta definir un pago. Datos ficticios.",
  movimientos:
    "Ejemplo de Movimientos: un sueldo como ingreso y compras como gastos, con sus importes y fechas. Datos ficticios.",
  pagos:
    "Ejemplo de Pagos de noviembre de 2026: monotributo con importe y electricidad por definir, ambos pendientes por separado. Datos ficticios.",
  cotizaciones:
    "Ejemplo de Cotizaciones: dólar oficial, euro y real. Referencias de DolarApi capturadas con fecha, sin actualización en esta portada.",
  mercados:
    "Ejemplo de Mercados: búsqueda por nombre o símbolo y cinco favoritas entre S&P 100 y Nasdaq-100. Selección ficticia; sin precios simulados.",
  importacion:
    "Ejemplo de Importación: leer PDF, CSV y Excel, revisar movimientos y confirmar. Datos ficticios; no se cargan archivos desde esta ilustración.",
  asistente:
    "Ejemplo de Flujario AI: pregunta estadística sobre categorías, con importes calculados a partir de movimientos ficticios. Sin llamadas a IA.",
  noticias:
    "Ejemplo de Noticias: períodos diario y semanal, medio de origen y tarjeta ilustrativa. No son noticias reales.",
};
const titles: Record<PreviewKind, string> = {
  resumen: "Resumen",
  movimientos: "Movimientos",
  pagos: "Pagos",
  cotizaciones: "Cotizaciones",
  mercados: "Mercados",
  importacion: "Importar resumen",
  asistente: "Flujario AI",
  noticias: "Noticias",
};

// Comparte las piezas del panel, no su loader ni sus acciones privadas.
// inert convierte los controles ilustrados en una vista sin clics ni foco.
export function ProductPreview({ kind }: { kind: PreviewKind }) {
  const snapshot = productExample;
  return (
    <div className={`product-preview preview-${kind}`} role="img" aria-label={descriptions[kind]}>
      <div inert>
        <div className="product-preview-header">
          <span className="product-preview-brand">
            <BrandArtwork />
          </span>
          <span>{titles[kind]}</span>
          <span className="product-preview-currency">
            {kind === "cotizaciones"
              ? "ARS por unidad"
              : kind === "mercados"
                ? "Favoritas de ejemplo"
                : kind === "noticias"
                  ? "Vista ilustrativa"
                  : kind === "resumen"
                    ? "ARS y USD"
                    : "Cuenta en ARS"}
          </span>
        </div>
        <div className="product-preview-body">
          {kind === "mercados" && (
            <div className="landing-market-demo">
              <div className="landing-demo-tabs">
                <span>S&P 100</span>
                <span>Nasdaq-100</span>
              </div>
              <h3>
                Mis favoritas <small>3 / 5</small>
              </h3>
              <p>Buscar para agregar favoritas</p>
              <div className="landing-demo-search">
                <Search size={16} />
                <span>Apple o AAPL</span>
              </div>
              {catalog.companies
                .filter((c) => ["AAPL", "MSFT", "MELI"].includes(c.symbol))
                .map((c) => (
                  <div className="landing-demo-stock" key={c.id}>
                    <div>
                      <strong>{c.name}</strong>
                      <small>{c.symbol}</small>
                    </div>
                    <Star size={18} fill="currentColor" />
                  </div>
                ))}
              <p className="product-preview-note">
                Selección ficticia · Los precios se consultan en TradingView dentro del panel.
              </p>
            </div>
          )}
          {kind === "importacion" && (
            <div className="landing-import-demo">
              <div className="landing-demo-tabs">
                <span>PDF</span>
                <span>CSV</span>
                <span>Excel</span>
              </div>
              <h3>
                <FileCheck2 size={20} /> Revisá antes de confirmar.
              </h3>
              <p>1. Leer en tu dispositivo → 2. Revisar → 3. Confirmar</p>
              <EntriesTable
                entries={snapshot.entries
                  .filter((e) => e.kind === "income" || e.kind === "expense")
                  .slice(0, 3)}
                currency="ARS"
              />
              <p className="product-preview-note">
                Datos ficticios · El original permanece en tu dispositivo.
              </p>
            </div>
          )}
          {kind === "asistente" && (
            <div className="landing-assistant-demo">
              <div className="landing-assistant-heading">
                <img
                  src="/images/flujario-avatar.webp"
                  alt=""
                  width="60"
                  height="60"
                  loading="lazy"
                />
                <div>
                  <h3>Flujario AI</h3>
                  <small>Estadísticas de tus registros</small>
                </div>
              </div>
              <p className="landing-demo-question">¿En qué gasté más este mes?</p>
              <span className="chat-answer-source">Ejemplo ficticio · Estadística sin IA</span>
              <FinancialReportView
                report={createFinancialReport(
                  {
                    ledger: snapshot.entries
                      .filter((e) => e.kind === "income" || e.kind === "expense")
                      .map((e) => ({
                        ...e,
                        kind: e.kind as "income" | "expense",
                        occurrenceId: null,
                      })),
                    statements: emptyStatementState(),
                    payments: [],
                  },
                  presetPlan("most"),
                  "ARS",
                  snapshot.asOf,
                )}
              />
            </div>
          )}
          {kind === "noticias" && (
            <div className="landing-news-demo">
              <div className="landing-demo-tabs">
                <span>Del día</span>
                <span>De la semana</span>
              </div>
              <NewsArtwork imageUrl={null} category="economia" />
              <p className="eyebrow">DIARIO DE EJEMPLO · ECONOMÍA</p>
              <h3>Título de una noticia económica</h3>
              <p>Medio, fecha y enlace para leer en su sitio original.</p>
              <p className="product-preview-note">Tarjeta ilustrativa · No es una noticia real.</p>
            </div>
          )}
          {kind === "resumen" && (
            <BalanceFocus snapshot={snapshot} view="both" onView={() => {}} base="" illustration />
          )}
          {kind === "movimientos" && (
            <div className="data-panel">
              <EntriesTable
                entries={snapshot.entries
                  .filter(
                    (entry) =>
                      entry.currency === "ARS" &&
                      (entry.kind === "income" || entry.kind === "expense"),
                  )
                  .slice(0, 3)}
                currency="ARS"
              />
            </div>
          )}
          {kind === "pagos" && (
            <>
              <p className="product-preview-month">
                Noviembre de 2026 <span>Pendientes</span>
              </p>
              <MobilePayments
                payments={paymentsInMonth(snapshot.payments, "2026-11", "ARS").slice(0, 2)}
                asOf={snapshot.asOf}
                open={() => {}}
              />
            </>
          )}
          {kind === "cotizaciones" && (
            <>
              <p className="product-preview-note">
                Referencias capturadas · DolarApi · No se actualizan en esta portada.
              </p>
              <QuoteCards
                quotes={snapshot.quotes}
                asOf={snapshot.asOf}
                series={["usd-oficial", "eur", "brl"]}
              />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
