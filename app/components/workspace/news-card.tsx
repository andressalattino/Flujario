import { useState } from "react";
import { useFetcher } from "react-router";
import { ArrowUpRight, Bookmark, Star } from "lucide-react";
import type { NewsArticle, NewsSourceState } from "~/domain/news";
import { newsCategoryNames } from "~/domain/news";
import { NewsArtwork } from "./news-artwork";

type SaveResult = { ok: boolean; error: string | null };
export function NewsPreference({
  source,
  article,
  preview = false,
}: {
  source?: NewsSourceState;
  article?: NewsArticle;
  preview?: boolean;
}) {
  const fetcher = useFetcher<SaveResult>();
  const initial = source ? source.favorite : article!.saved;
  const [example, setExample] = useState(initial);
  const submitted = fetcher.formData?.get("saved");
  const saved = preview ? example : submitted ? submitted === "yes" : initial;
  const label = source
    ? `${saved ? "Dejar de priorizar" : "Priorizar"} ${source.name} en Resumen`
    : `${saved ? "Quitar de guardadas" : "Guardar noticia"}: ${article!.title}`;
  const Icon = source ? Star : Bookmark;
  return (
    <div className={source ? "news-source-preference" : "news-save"}>
      <button
        type="button"
        aria-pressed={saved}
        aria-label={label}
        title={label}
        disabled={fetcher.state !== "idle"}
        onClick={() => {
          if (preview) {
            setExample(!saved);
            return;
          }
          fetcher.submit(
            source
              ? { intent: "favorite-source", source: source.id, saved: saved ? "no" : "yes" }
              : { intent: "save-article", articleId: article!.id, saved: saved ? "no" : "yes" },
            { action: "/app/noticias/datos", method: "post" },
          );
        }}
      >
        <Icon size={17} fill={saved ? "currentColor" : "none"} />
        {source && <span>{saved ? "Diario favorito" : "Priorizar en Resumen"}</span>}
      </button>
      {fetcher.data?.error && (
        <span className="form-error" role="alert">
          {fetcher.data.error}
        </span>
      )}
    </div>
  );
}
export function NewsCard({
  article,
  preview = false,
}: {
  article: NewsArticle;
  preview?: boolean;
}) {
  return (
    <article className="financial-news-card">
      <NewsArtwork imageUrl={article.imageUrl} category={article.category}>
        <NewsPreference article={article} preview={preview} />
      </NewsArtwork>
      <div className="news-card-copy">
        <p className="news-card-source">
          {article.sourceName} <span>· {newsCategoryNames[article.category]}</span>
        </p>
        <h3>
          <a href={article.url} target="_blank" rel="noopener noreferrer">
            {article.title}
          </a>
        </h3>
        {article.description && <p className="news-card-description">{article.description}</p>}
        <div className="news-card-bottom">
          <time dateTime={article.publishedAt}>
            {new Intl.DateTimeFormat("es-AR", {
              day: "numeric",
              month: "short",
              hour: "2-digit",
              minute: "2-digit",
              timeZone: "America/Argentina/Buenos_Aires",
            }).format(new Date(article.publishedAt))}
          </time>
          <a href={article.url} target="_blank" rel="noopener noreferrer">
            Leer noticia <ArrowUpRight size={14} />
          </a>
        </div>
      </div>
    </article>
  );
}
