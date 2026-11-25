import { useEffect, useState } from "react";
import { useFetcher, useRevalidator, useSearchParams } from "react-router";
import { Star, Search, ExternalLink, ChartNoAxesCombined, ArrowDownAZ } from "lucide-react";
import { Input } from "../ui/input";
import { Button } from "../ui/button";
import { Empty } from "./shared";
import { StockChart } from "./stock-chart";
import { MarketWidget } from "./market-widget";
import { verifiedWidgetSymbols, type MarketWidgetView } from "~/domain/tradingview-widget";
import { marketPreview } from "~/data/market-preview";
import {
  selectIndexCompanies,
  STOCK_FAVORITES_LIMIT,
  STOCK_FAVORITES_LIMIT_MESSAGE,
  type MarketSnapshot,
  type StockCompany,
  type StockIndexId,
} from "~/domain/markets";
import type { Snapshot } from "~/domain/finance";
import { wikiRevisionId, catalogDue } from "~/domain/market-catalog";
import { today } from "~/domain/dates";
type SaveResult = { ok: boolean; error: string | null };
export function Markets({
  snapshot,
  query,
  onlySaved,
  updateParam,
  preview = false,
}: {
  snapshot: Snapshot;
  query: string;
  onlySaved: boolean;
  updateParam: (key: string, value: string) => void;
  preview?: boolean;
}) {
  const data = snapshot.markets ?? marketPreview(snapshot.favorites);
  const [params] = useSearchParams();
  const [indexId, setIndexId] = useState<StockIndexId>(data.selectedIndex);
  const [search, setSearch] = useState(query);
  const [favoriteSearch, setFavoriteSearch] = useState("");
  const [localFavorites, setLocalFavorites] = useState(data.favorites);
  const [selected, setSelected] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [widgetView, setWidgetView] = useState<MarketWidgetView>("performance");
  const favoriteFetcher = useFetcher<SaveResult>(),
    indexFetcher = useFetcher<SaveResult>();
  const revalidator = useRevalidator();
  useEffect(() => setSearch(query), [query]);
  useEffect(() => {
    if (!preview) setLocalFavorites(data.favorites);
  }, [data.favorites, preview]);
  useEffect(() => {
    if (indexFetcher.state === "idle") setIndexId(data.selectedIndex);
  }, [data.selectedIndex]);
  useEffect(() => {
    if (favoriteFetcher.state === "idle" && favoriteFetcher.data) {
      setError(favoriteFetcher.data.error);
      if (!favoriteFetcher.data.ok) revalidator.revalidate();
    }
  }, [favoriteFetcher.state, favoriteFetcher.data]);
  useEffect(() => {
    if (indexFetcher.state === "idle" && indexFetcher.data?.error) {
      setError(indexFetcher.data.error);
      setIndexId(data.selectedIndex);
    }
  }, [indexFetcher.state, indexFetcher.data]);
  const favorites = preview ? localFavorites : data.favorites;
  const view: MarketSnapshot = { ...data, favorites };
  const descending = params.get("orden") === "nombre-desc";
  const filtered = selectIndexCompanies(view, indexId, search, onlySaved, descending);
  const favoriteMatches = favoriteSearch.trim()
    ? selectIndexCompanies(view, indexId, favoriteSearch, false)
    : [];
  const index = data.indices.find((i) => i.id === indexId)!;
  const wikiSource = !!wikiRevisionId(index.sourceUrl);
  const widgetSymbols = verifiedWidgetSymbols(filtered);
  const members = data.members.filter((m) => m.indexId === indexId);
  const savedCompanies = favorites
    .map((id) => data.companies.find((c) => c.id === id))
    .filter((c): c is StockCompany => Boolean(c));
  const active = savedCompanies.find((c) => c.id === selected) ?? savedCompanies[0];
  const busy = favoriteFetcher.state !== "idle";
  const date = (value: string) =>
    new Intl.DateTimeFormat("es-AR", {
      day: "numeric",
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    }).format(new Date(value + "T12:00:00Z"));
  function favorite(company: StockCompany) {
    setError(null);
    const saved = favorites.includes(company.id);
    if (preview) {
      if (!saved && favorites.length >= STOCK_FAVORITES_LIMIT) {
        setError(STOCK_FAVORITES_LIMIT_MESSAGE);
        return;
      }
      setLocalFavorites(
        saved ? favorites.filter((id) => id !== company.id) : [...favorites, company.id],
      );
      return;
    }
    favoriteFetcher.submit(
      { intent: "favorite", symbol: company.symbol, saved: saved ? "no" : "yes" },
      { method: "post", action: "/app/mercados/datos" },
    );
  }
  function chooseIndex(id: StockIndexId) {
    if (id === indexId) return;
    setError(null);
    setIndexId(id);
    if (preview) updateParam("indice", id);
    else
      indexFetcher.submit(
        { intent: "market-index", indexId: id },
        { method: "post", action: "/app/mercados/datos" },
      );
  }
  const star = (company: StockCompany) => {
    const saved = favorites.includes(company.id);
    return (
      <button
        className={`stock-star ${saved ? "is-saved" : ""}`}
        type="button"
        aria-pressed={saved}
        aria-label={`${saved ? "Quitar de favoritas" : "Guardar como favorita"}: ${company.name} (${company.symbol})`}
        title={saved ? "Quitar de favoritas" : "Guardar como favorita"}
        disabled={busy}
        onClick={() => favorite(company)}
      >
        <Star size={18} fill={saved ? "currentColor" : "none"} />
      </button>
    );
  };
  return (
    <section className="stock-markets" aria-label="Índices y acciones favoritas">
      <div className="stock-index-toolbar">
        <div className="stock-index-toggle" role="group" aria-label="Índice bursátil">
          {data.indices.map((i) => (
            <Button
              key={i.id}
              variant="outline"
              aria-pressed={i.id === indexId}
              disabled={indexFetcher.state !== "idle"}
              onClick={() => chooseIndex(i.id)}
            >
              {i.name}
            </Button>
          ))}
        </div>
        <span className="stock-verification">Catálogo consultado el {date(index.verifiedAt)}</span>
      </div>
      <div className="stock-index-intro">
        <div>
          <span className="eyebrow">EXPLORÁ UN ÍNDICE</span>
          <h2>{index.name}</h2>
          <p>{index.description}</p>
        </div>
        <div className="stock-index-count">
          <strong>{members.length}</strong>
          <span>instrumentos listados</span>
          <a href={index.sourceUrl} target="_blank" rel="noopener noreferrer">
            Ver fuente del índice <ExternalLink size={12} />
          </a>
        </div>
      </div>
      <p className="stock-explainer">
        Un índice reúne un grupo de empresas. Algunas tienen distintas clases de acciones y por eso
        puede haber más de 100 símbolos. Estas son acciones de sus bolsas de origen.
      </p>
      {preview && (
        <p className="stock-preview-note">
          Vista previa local: las estrellas son de ejemplo y sus cambios no se guardan en tu cuenta.
          Los gráficos provienen de TradingView.
        </p>
      )}
      {error && (
        <p className="stock-error" role="alert">
          {error}
        </p>
      )}
      <section className="stock-favorites-panel" aria-labelledby="stock-favorites-title">
        <div className="stock-favorites-top">
          <div>
            <span className="eyebrow">TU SELECCIÓN, EN LOS DOS ÍNDICES</span>
            <h2 id="stock-favorites-title">
              <Star size={19} /> Mis favoritas
            </h2>
          </div>
          <span className="stock-favorite-count">
            {favorites.length} / {STOCK_FAVORITES_LIMIT}
          </span>
        </div>
        <div className="stock-favorite-picker">
          <label className="stock-favorite-search-label" htmlFor="stock-favorite-search">
            Buscar para agregar favoritas
          </label>
          <div className="search-field">
            <Search size={18} aria-hidden="true" />
            <Input
              id="stock-favorite-search"
              type="search"
              autoComplete="off"
              spellCheck={false}
              maxLength={80}
              placeholder="Ej.: Apple o AAPL"
              aria-describedby="stock-favorite-search-help"
              value={favoriteSearch}
              onChange={(e) => setFavoriteSearch(e.target.value)}
              className="focus-visible:ring-0"
            />
          </div>
          <p className="field-hint" id="stock-favorite-search-help">
            Buscás en {index.name}. Marcá la estrella para seguir una acción; podés guardar cinco
            entre ambos índices.
          </p>
          {favoriteSearch.trim() && (
            <>
              <p className="stock-favorite-search-status" role="status">
                {favoriteMatches.length
                  ? `${favoriteMatches.length} ${favoriteMatches.length === 1 ? "resultado" : "resultados"}${favoriteMatches.length > 6 ? " · se muestran los primeros seis; precisá la búsqueda para ver otros" : ""}.`
                  : `Sin resultados en ${index.name}. Probá otro nombre o cambiá el índice de arriba.`}
              </p>
              {favoriteMatches.length > 0 && (
                <ul
                  className="stock-favorite-results"
                  aria-label="Resultados para elegir favoritas"
                >
                  {favoriteMatches.slice(0, 6).map((c) => (
                    <li key={c.id}>
                      <div>
                        <strong>{c.name}</strong>
                        <span>
                          {c.symbol} · {c.exchange}
                        </span>
                      </div>
                      {star(c)}
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </div>
        {savedCompanies.length ? (
          <>
            <div
              className="stock-favorite-options"
              role="group"
              aria-label="Elegir favorita para el gráfico"
            >
              {savedCompanies.map((c) => (
                <div className="stock-favorite-option" key={c.id}>
                  <button
                    type="button"
                    aria-pressed={active?.id === c.id}
                    onClick={() => setSelected(c.id)}
                  >
                    <strong>{c.symbol}</strong>
                    <span>{c.name}</span>
                    {!data.members.some((m) => m.companyId === c.id) && (
                      <small className="stock-former">Fuera de los índices actuales</small>
                    )}
                  </button>
                  {star(c)}
                </div>
              ))}
            </div>
            {active && <StockChart key={active.id} company={active} />}
          </>
        ) : (
          <Empty icon={Star} title="Elegí tu primera acción favorita.">
            Buscá una empresa arriba y marcá su estrella para seguir el gráfico. También podés
            elegirla en el catálogo completo de abajo.
          </Empty>
        )}
      </section>
      <section className="stock-company-list" aria-labelledby="stock-list-title">
        <div className="stock-list-top">
          <div>
            <span className="eyebrow">EL LISTADO COMPLETO</span>
            <h2 id="stock-list-title">Empresas del {index.name}</h2>
          </div>
          <span>
            {filtered.length} de {members.length}
          </span>
        </div>
        <div className="stock-list-controls">
          <label className="search-field">
            <Search size={16} />
            <Input
              aria-label="Buscar empresas por nombre o símbolo"
              placeholder="Buscá una empresa o su símbolo…"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                updateParam("q", e.target.value);
              }}
            />
          </label>
          <label className="stock-sort">
            <ArrowDownAZ size={16} />
            <span className="sr-only">Ordenar empresas</span>
            <select
              aria-label="Ordenar empresas"
              value={descending ? "nombre-desc" : "nombre-asc"}
              onChange={(e) => updateParam("orden", e.target.value)}
            >
              <option value="nombre-asc">Nombre: A–Z</option>
              <option value="nombre-desc">Nombre: Z–A</option>
            </select>
          </label>
          <label className="stock-only-favorites">
            <input
              type="checkbox"
              checked={onlySaved}
              onChange={(e) => updateParam("favoritos", e.target.checked ? "si" : "")}
            />
            Sólo favoritas de este índice
          </label>
        </div>
        <p className="stock-data-note">
          <ChartNoAxesCombined size={17} />
          <span>
            La tabla de TradingView muestra precios y variaciones de esta selección: Hoy es la
            variación diaria, 1M un mes y 1Y un año. 1M no equivale necesariamente a 30 días
            exactos. La demora depende del mercado y los valores pueden cambiar durante la rueda.
          </span>
        </p>
        {widgetSymbols.length < filtered.length && (
          <p className="field-hint" role="status">
            {filtered.length - widgetSymbols.length} acciones todavía no tienen una bolsa verificada
            para TradingView. Siguen disponibles para favoritas; sus precios no se completan por
            suposición.
          </p>
        )}
        {filtered.length ? (
          <>
            <div className="stock-widget-toolbar">
              <div
                className="stock-widget-toggle"
                role="group"
                aria-label="Vista de las cotizaciones"
              >
                <Button
                  variant="outline"
                  size="sm"
                  aria-pressed={widgetView === "performance"}
                  onClick={() => setWidgetView("performance")}
                >
                  Rendimiento
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  aria-pressed={widgetView === "overview"}
                  onClick={() => setWidgetView("overview")}
                >
                  Precio y variación diaria
                </Button>
              </div>
              <span className="field-hint">
                {filtered.length} {filtered.length === 1 ? "acción" : "acciones"} · Datos provistos
                por TradingView
              </span>
            </div>
            <MarketWidget
              symbols={widgetSymbols}
              view={widgetView}
              title={`Cotizaciones y rendimiento del ${index.name}`}
            />
            <details className="stock-catalog-controls" open>
              <summary>
                Elegir favoritas · catálogo de {filtered.length}{" "}
                {filtered.length === 1 ? "acción" : "acciones"}
              </summary>
              <p className="field-hint">
                Marcá las estrellas de Flujario en este catálogo. Se comparten entre los dos índices
                y aparecen en Resumen.
              </p>
              <div
                className="stock-table-scroll"
                role="region"
                aria-label="Tabla de empresas"
                tabIndex={0}
              >
                <table className="stock-table">
                  <caption className="sr-only">
                    Catálogo de empresas del {index.name} para elegir favoritas de Flujario.
                  </caption>
                  <thead>
                    <tr>
                      <th scope="col">Empresa</th>
                      <th scope="col">Símbolo</th>
                      <th scope="col">Favorita</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((c) => (
                      <tr key={c.id}>
                        <th scope="row">
                          {c.name}
                          <small>{c.exchange}</small>
                        </th>
                        <td className="stock-symbol">{c.symbol}</td>
                        <td>{star(c)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="stock-mobile-list">
                {filtered.map((c) => (
                  <article key={c.id}>
                    <div>
                      <strong>{c.name}</strong>
                      <span>
                        {c.symbol} · {c.exchange}
                      </span>
                    </div>
                    {star(c)}
                  </article>
                ))}
              </div>
            </details>
          </>
        ) : (
          <Empty icon={Search} title="No hay empresas para esta búsqueda.">
            Probá otro nombre, un símbolo o quitá el filtro de favoritas. Tus favoritas de ambos
            índices siguen en el panel de arriba.
          </Empty>
        )}
        <p className="stock-composition-note">
          {wikiSource ? (
            <>
              Edición de la fuente: {date(index.compositionDate)}.{" "}
              <a href={index.sourceUrl} target="_blank" rel="noopener noreferrer">
                Wikipedia, revisión consultada
              </a>{" "}
              ·{" "}
              <a
                href="https://creativecommons.org/licenses/by-sa/4.0/"
                target="_blank"
                rel="noopener noreferrer"
              >
                CC BY-SA 4.0
              </a>
              .{" "}
            </>
          ) : (
            <>Referencia inicial de composición: {date(index.compositionDate)}. </>
          )}
          Revisión automática cada 15 días, con comprobación diaria. Las favoritas se conservan si
          salen del índice.
          {catalogDue(index, today()) &&
            " Revisión pendiente: se mantiene la última lista válida."}{" "}
          La fuente es comunitaria; su fecha de edición no es la fecha de entrada en el índice. Los
          precios de TradingView se actualizan por separado.
        </p>
      </section>
    </section>
  );
}
