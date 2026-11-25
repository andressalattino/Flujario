import { Link } from "react-router";
import { ArrowUpRight, Star } from "lucide-react";
import { companies } from "~/data/companies";
import catalog from "~/data/stock-catalog.json";
import { MarketWidget } from "./market-widget";
import { verifiedWidgetSymbols } from "~/domain/tradingview-widget";
import type { StockCompany } from "~/domain/markets";

export function marketSelection(
  favorites: string[],
  currentCompanies: Pick<
    StockCompany,
    "symbol" | "name" | "tradingviewSymbol"
  >[] = catalog.companies,
) {
  const symbols = [
    ...new Set([...favorites].sort().concat(["AAPL", "MSFT", "NVDA", "MELI", "KO"])),
  ].slice(0, 5);
  return symbols.map((symbol) => ({
    symbol,
    tradingviewSymbol:
      currentCompanies.find((company) => company.symbol === symbol)?.tradingviewSymbol ?? null,
    name:
      companies.find((company) => company.symbol === symbol)?.name ??
      currentCompanies.find((company) => company.symbol === symbol)?.name ??
      symbol,
  }));
}
export function MarketBrief({
  favorites,
  base,
  companies,
}: {
  favorites: string[];
  base: string;
  companies?: StockCompany[];
}) {
  const selected = marketSelection(favorites, companies);
  const savedCount = selected.filter((company) => favorites.includes(company.symbol)).length;
  return (
    <aside className="market-brief" aria-labelledby="market-brief-title">
      <div className="overview-section-top">
        <div>
          <span className="eyebrow">TU RADAR</span>
          <h2 id="market-brief-title">Acciones para seguir</h2>
        </div>
        <Star size={18} strokeWidth={1.4} />
      </div>
      <p className="market-brief-caption">
        {favorites.length
          ? savedCount === 5
            ? `Tus favoritas · 5 de ${new Set(favorites).size}`
            : `${savedCount} favorita${savedCount === 1 ? "" : "s"} · ${5 - savedCount} del catálogo`
          : "Selección inicial · No es un ranking"}
      </p>
      <ul className="radar-legend" aria-label="Símbolos del radar y favoritas">
        {selected.map((company) => (
          <li key={company.symbol}>
            <span title={company.name}>{company.symbol}</span>
            {favorites.includes(company.symbol) && (
              <small className="stock-saved">
                <Star size={10} fill="currentColor" />
                Favorita
              </small>
            )}
          </li>
        ))}
      </ul>
      <p className="radar-scroll-hint">
        Deslizá dentro del radar para recorrer las cinco acciones.
      </p>
      <MarketWidget
        symbols={verifiedWidgetSymbols(selected)}
        title="Precios y variación diaria de las cinco acciones del radar"
        view="overview"
        compact
      />
      <Link
        to={`${base}/mercados?favoritos=${favorites.length ? "si" : ""}`}
        className="text-link small"
      >
        Elegir mis favoritas <ArrowUpRight size={14} />
      </Link>
      <p className="market-brief-note">
        Precios y variación diaria de TradingView. La cobertura y demora dependen del mercado; no es
        una captura fija de cierres.
      </p>
    </aside>
  );
}
