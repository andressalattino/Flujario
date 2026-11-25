import { useEffect, useState } from "react";
import { Link } from "react-router";
import { ArrowLeft, ArrowRight, ArrowUpRight, Newspaper, Play, Pause } from "lucide-react";
import type { Snapshot } from "~/domain/finance";
import { formatFullDate, today } from "~/domain/dates";
import { Button } from "../ui/button";
import { emptyNewsOverview, type NewsArticle } from "~/domain/news";
import { NewsArtwork } from "./news-artwork";

type CarouselEdition = { period: string; articles: NewsArticle[] };

export function NewsCarousel({
  snapshot,
  base,
  cadence,
  onCadence,
}: {
  snapshot: Snapshot;
  base: string;
  cadence: "daily" | "weekly";
  onCadence: (value: "daily" | "weekly") => void;
}) {
  const news = snapshot.news ?? emptyNewsOverview(new Date(`${snapshot.asOf}T15:00:00Z`));
  const selected = news[cadence];
  const newsDate = today(new Date(news.asOf));
  const edition: CarouselEdition | null = selected.length
    ? {
        period: cadence === "weekly" ? (news.weeklyPeriod ?? newsDate) : newsDate,
        articles: selected,
      }
    : null;
  const favoriteNames = news.sources
    .filter((source) => source.favorite)
    .map((source) => source.name);
  return (
    <section className="overview-news" aria-labelledby="overview-news-title">
      <div className="overview-section-top">
        <div>
          <span className="eyebrow">PARA ENTENDER EL CONTEXTO</span>
          <h2 id="overview-news-title">Actualidad financiera</h2>
        </div>
        <Newspaper size={25} strokeWidth={1.3} />
      </div>
      <div className="news-cadence" aria-label="Edición de noticias">
        <button aria-pressed={cadence === "daily"} onClick={() => onCadence("daily")}>
          Del día
        </button>
        <button aria-pressed={cadence === "weekly"} onClick={() => onCadence("weekly")}>
          De la semana
        </button>
      </div>
      <ArticleCarousel
        key={`${cadence}:${edition?.period}:${edition?.articles.map((a) => a.id).join(",")}`}
        edition={edition}
        asOf={newsDate}
        cadence={cadence}
        schedule={
          cadence === "daily"
            ? "Noticias de hoy. Las fuentes habilitadas se revisan cada 30 minutos."
            : "Selección semanal. Se renueva los lunes a las 10:00 de Argentina."
        }
        favoriteNames={favoriteNames}
      />
      <Link
        className="text-link small"
        to={`${base}/noticias?edicion=${cadence === "daily" ? "diaria" : "semanal"}`}
      >
        Ir a Noticias <ArrowUpRight size={14} />
      </Link>
      <p className="overview-news-preferences">
        {favoriteNames.length
          ? `Diarios favoritos primero: ${favoriteNames.join(", ")}.`
          : "Una noticia por diario disponible. Elegí tus diarios favoritos en Noticias."}
      </p>
    </section>
  );
}

export function ArticleCarousel({
  edition,
  asOf,
  cadence,
  schedule,
  favoriteNames = [],
}: {
  edition: CarouselEdition | null;
  asOf: string;
  cadence: "daily" | "weekly";
  schedule?: string;
  favoriteNames?: string[];
}) {
  const articles = edition?.articles.slice(0, 5) ?? [];
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [visible, setVisible] = useState(true);
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const media = matchMedia("(prefers-reduced-motion: reduce)");
    const motion = () => {
      setReduced(media.matches);
      if (media.matches) setPlaying(false);
    };
    const visibility = () => setVisible(document.visibilityState === "visible");
    motion();
    visibility();
    media.addEventListener("change", motion);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      media.removeEventListener("change", motion);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, []);
  useEffect(() => {
    if (!playing || hovered || focused || !visible || reduced || articles.length < 2) return;
    const timer = window.setInterval(
      () => setIndex((value) => (value + 1) % articles.length),
      8000,
    );
    return () => window.clearInterval(timer);
  }, [playing, hovered, focused, visible, reduced, articles.length]);
  const article = articles[index % Math.max(articles.length, 1)];
  const stale =
    edition &&
    (cadence === "daily"
      ? edition.period < asOf
      : new Date(`${asOf}T12:00:00Z`).getTime() -
          new Date(`${edition.period}T12:00:00Z`).getTime() >=
        7 * 86400000);
  function move(step: number) {
    setPlaying(false);
    setIndex((value) => (value + step + articles.length) % articles.length);
  }
  return (
    <div
      className="article-carousel"
      aria-roledescription="carrusel"
      aria-label="Hasta cinco noticias de economía"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocusCapture={() => setFocused(true)}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setFocused(false);
      }}
    >
      {article ? (
        <article className="news-slide" aria-live={playing ? "off" : "polite"} aria-atomic="true">
          <a
            className="news-slide-image-link"
            href={article.url}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`Leer noticia: ${article.title}`}
          >
            <NewsArtwork key={article.id} imageUrl={article.imageUrl} category={article.category} />
          </a>
          <div className="news-slide-source">
            <span>{article.sourceName}</span>
            {favoriteNames.includes(article.sourceName) && (
              <span className="news-favorite-label">Diario favorito</span>
            )}
            <time dateTime={article.publishedAt}>{formatFullDate(article.publishedAt)}</time>
          </div>
          {stale && (
            <p className="news-stale">
              Última edición disponible · {formatFullDate(edition!.period)}
            </p>
          )}
          <h3>
            <a href={article.url} target="_blank" rel="noopener noreferrer">
              {article.title}
              <ArrowUpRight size={19} />
            </a>
          </h3>
          {article.description && <p>{article.description}</p>}
          <a
            className="text-link small"
            href={article.url}
            target="_blank"
            rel="noopener noreferrer"
          >
            Leer noticia <ArrowUpRight size={14} />
          </a>
        </article>
      ) : (
        <div className="news-awaiting">
          <span className="news-awaiting-mark" aria-hidden="true">
            ✳
          </span>
          <h3>El contexto empieza por una buena fuente.</h3>
          <p>
            Todavía no hay artículos publicados. Acá vas a encontrar hasta cinco noticias para leer
            de a una.
          </p>
          <span>
            {schedule ??
              `${
                cadence === "daily"
                  ? "Edición diaria · Todos los días"
                  : "Edición semanal · Los lunes"
              } a las 10:00 de Argentina.`}
          </span>
        </div>
      )}
      <div className="carousel-controls">
        <span className="carousel-position">
          {articles.length
            ? `${(index % articles.length) + 1} / ${articles.length}`
            : "Sin artículos todavía"}
        </span>
        <div>
          <Button
            variant="ghost"
            size="icon"
            aria-label={playing ? "Pausar noticias" : "Reproducir noticias"}
            disabled={articles.length < 2 || reduced}
            title={
              reduced
                ? "La reducción de movimiento está activada"
                : playing
                  ? "Pausar"
                  : "Reproducción opcional cada 8 segundos"
            }
            onClick={() => {
              setPlaying((value) => !value);
              setFocused(false);
              setHovered(false);
            }}
          >
            {playing ? <Pause size={16} /> : <Play size={16} />}
          </Button>
          <Button
            variant="outline"
            size="icon"
            disabled={articles.length < 2}
            aria-label="Noticia anterior"
            onClick={() => move(-1)}
          >
            <ArrowLeft size={16} />
          </Button>
          <Button
            variant="outline"
            size="icon"
            disabled={articles.length < 2}
            aria-label="Noticia siguiente"
            onClick={() => move(1)}
          >
            <ArrowRight size={16} />
          </Button>
        </div>
      </div>
    </div>
  );
}
