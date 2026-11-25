import { useEffect, useRef, useState } from "react";
import { useNavigation, useRevalidator, useSearchParams } from "react-router";
import { ArrowUpRight, Bookmark, Clock3, Newspaper, RefreshCw } from "lucide-react";
import type { Snapshot } from "~/domain/finance";
import { emptyNewsOverview, newsQueryFromUrl, type NewsPage } from "~/domain/news";
import { NewsCard, NewsPreference } from "./news-card";
import { Button } from "../ui/button";

export function News({ snapshot, preview = false }: { snapshot: Snapshot; preview?: boolean }) {
  const [params, setParams] = useSearchParams();
  const navigation = useNavigation();
  const paramsRef = useRef(params);
  useEffect(() => {
    if (navigation.state === "idle") paramsRef.current = params;
  }, [params, navigation.state]);
  const revalidator = useRevalidator();
  const query = newsQueryFromUrl(params);
  const overview = snapshot.news ?? emptyNewsOverview(new Date(`${snapshot.asOf}T15:00:00Z`));
  const page: NewsPage = snapshot.newsPage ?? {
    query,
    asOf: overview.asOf,
    sources: overview.sources,
    groups: overview.sources
      .filter((source) => query.source === "all" || query.source === source.id)
      .map((source) => ({ source: source.id, articles: [], total: 0 })),
    weeklyPeriod: overview.weeklyPeriod,
    weeklyPublishedAt: overview.weeklyPublishedAt,
  };
  const [search, setSearch] = useState(query.search);
  useEffect(() => setSearch(query.search), [query.search]);
  const busy = navigation.state !== "idle" || revalidator.state !== "idle";
  function change(values: Record<string, string | null>) {
    const next = new URLSearchParams(paramsRef.current);
    next.delete("pagina");
    next.delete("categoria");
    for (const [key, value] of Object.entries(values)) {
      if (value === null || value === "") next.delete(key);
      else next.set(key, value);
    }
    paramsRef.current = next;
    setParams(next, { preventScrollReset: true });
  }
  const lastSuccess = page.sources
    .map((source) => source.lastSuccessAt)
    .filter((value): value is string => Boolean(value))
    .sort()
    .at(-1);
  const stamp = (value: string) =>
    new Intl.DateTimeFormat("es-AR", {
      dateStyle: "short",
      timeStyle: "short",
      timeZone: "America/Argentina/Buenos_Aires",
    }).format(new Date(value));
  return (
    <section className="financial-news" aria-label="Actualidad financiera" aria-busy={busy}>
      <div className="financial-news-intro">
        <span>
          <Clock3 size={14} />
          {lastSuccess
            ? `Última sincronización exitosa: ${stamp(lastSuccess)}`
            : "Sin noticias sincronizadas todavía"}
        </span>
        <Button variant="ghost" size="sm" onClick={() => revalidator.revalidate()} disabled={busy}>
          <RefreshCw size={14} />
          {busy ? "Actualizando…" : "Actualizar vista"}
        </Button>
      </div>
      {page.sources.some((source) => source.publication === "local-reader") && (
        <p className="news-period-caption">
          Lector RSS local · Titulares reales y enlaces al diario · Revisión automática cada 30
          minutos mientras el servidor esté abierto.
        </p>
      )}
      <div className="financial-news-filters">
        <div className="news-period-tabs" aria-label="Período de noticias">
          <button
            aria-pressed={query.saved === "no" && query.period === "daily"}
            onClick={() => change({ edicion: "diaria", guardadas: null })}
          >
            Hoy
          </button>
          <button
            aria-pressed={query.saved === "no" && query.period === "weekly"}
            onClick={() => change({ edicion: "semanal", guardadas: null })}
          >
            De la semana
          </button>
          <button aria-pressed={query.saved === "yes"} onClick={() => change({ guardadas: "si" })}>
            <Bookmark size={14} />
            Guardadas
          </button>
        </div>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            change({ buscar: search });
          }}
        >
          <label className="sr-only" htmlFor="news-search">
            Buscar noticias por título
          </label>
          <input
            id="news-search"
            name="buscar"
            type="search"
            placeholder="Buscar por título"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            maxLength={100}
          />
          <Button variant="outline" size="sm" type="submit">
            Buscar
          </Button>
        </form>
        <label>
          Diario
          <select
            value={query.source}
            onChange={(event) =>
              change({
                diario: event.target.value === "all" ? null : event.target.value,
                todas: null,
              })
            }
          >
            <option value="all">Todos los diarios</option>
            {page.sources.map((source) => (
              <option key={source.id} value={source.id}>
                {source.name}
              </option>
            ))}
          </select>
        </label>
        {(query.source !== "all" || query.search || query.saved === "yes") && (
          <button
            className="text-link small"
            onClick={() =>
              change({ diario: null, categoria: null, buscar: null, guardadas: null, todas: null })
            }
          >
            Limpiar filtros
          </button>
        )}
      </div>
      <p className="news-period-caption">
        {query.saved === "yes"
          ? "Tus noticias guardadas. Se eliminan junto con el historial al cumplir 15 días desde su publicación."
          : query.period === "daily"
            ? "Publicaciones de hoy · Horario de Argentina · Hasta cinco por diario; podés ver todas."
            : page.weeklyPeriod
              ? `Edición de la semana del ${new Intl.DateTimeFormat("es-AR", { day: "numeric", month: "long", timeZone: "America/Argentina/Buenos_Aires" }).format(new Date(`${page.weeklyPeriod}T15:00:00Z`))}. Se renueva los lunes a las 10:00.`
              : "La edición semanal aparecerá cuando se publique una selección. Se renueva los lunes a las 10:00 de Argentina."}
      </p>
      {preview && (
        <p className="news-preview-caption">
          Vista previa local. Las preferencias que pruebes acá no se guardan en tu cuenta.
        </p>
      )}
      {busy && (
        <div className="news-skeletons" aria-label="Cargando noticias">
          <div />
          <div />
          <div />
        </div>
      )}
      <div className={busy ? "news-results news-results-loading" : "news-results"}>
        {page.groups.map((group) => {
          const source = page.sources.find((item) => item.id === group.source)!;
          return (
            <section
              className="news-source-group"
              key={source.id}
              aria-labelledby={`news-source-${source.id}`}
            >
              <div className="news-source-heading">
                <div>
                  <span className="eyebrow">
                    {source.favorite ? "ENTRE TUS DIARIOS FAVORITOS" : "INFORMACIÓN EN SU ORIGEN"}
                  </span>
                  <h2 id={`news-source-${source.id}`}>{source.name}</h2>
                  <span>
                    {group.total
                      ? `${group.total} noticia${group.total === 1 ? "" : "s"} ${query.saved === "yes" ? "guardada" : "disponible"}${group.total === 1 ? "" : "s"}`
                      : source.publication === "pending"
                        ? "Fuente pendiente de habilitación"
                        : "Sin resultados para esta selección"}
                  </span>
                </div>
                <NewsPreference source={source} preview={preview} />
              </div>
              {source.status === "error" && (
                <p className="news-source-error" role="status">
                  No se pudo actualizar este diario. Conservamos las noticias disponibles con su
                  fecha.
                  {source.lastSuccessAt &&
                    ` Última sincronización exitosa: ${stamp(source.lastSuccessAt)}.`}
                </p>
              )}
              {group.articles.length ? (
                <div className="financial-news-grid">
                  {group.articles.map((article) => (
                    <NewsCard key={article.id} article={article} preview={preview} />
                  ))}
                </div>
              ) : (
                <div className="news-source-empty">
                  <Newspaper size={27} strokeWidth={1.2} />
                  <div>
                    <h3>
                      {source.publication === "pending"
                        ? "Estamos preparando esta fuente."
                        : "No hay noticias para estos filtros."}
                    </h3>
                    <p>
                      {source.publication === "pending"
                        ? source.id === "mdz"
                          ? "El RSS de MDZ todavía no está disponible. Podés leer su sección de Economía desde el enlace."
                          : "Esta fuente todavía no está habilitada para publicación."
                        : "Mostramos sólo noticias económicas. Si hay menos de cinco, dejamos las que están."}
                    </p>
                  </div>
                  <a
                    className="text-link small"
                    href={source.sectionUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Ir al diario <ArrowUpRight size={14} />
                  </a>
                </div>
              )}
              {group.total > 5 && query.limit === 5 && (
                <button
                  className="news-show-all text-link"
                  onClick={() => change({ diario: source.id, todas: "si" })}
                >
                  Ver todas de {source.name} <ArrowUpRight size={15} />
                </button>
              )}
            </section>
          );
        })}
      </div>
      {query.source !== "all" && query.limit > 5 && (
        <nav className="news-pagination" aria-label="Páginas de noticias">
          <Button
            variant="outline"
            disabled={busy || query.page === 1}
            onClick={() => change({ pagina: String(query.page - 1) })}
          >
            Anterior
          </Button>
          <span>
            Página {query.page} · {page.groups[0]?.total ?? 0} noticias
          </span>
          <Button
            variant="outline"
            disabled={busy || query.page * query.limit >= (page.groups[0]?.total ?? 0)}
            onClick={() => change({ pagina: String(query.page + 1) })}
          >
            Siguiente
          </Button>
        </nav>
      )}
      <p className="news-reading-note">
        Los titulares enlazan al artículo original. Las ilustraciones de Flujario no son fotografías
        de los hechos. Horarios de Argentina.
      </p>
    </section>
  );
}
