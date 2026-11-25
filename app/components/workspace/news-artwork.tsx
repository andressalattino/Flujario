import { useEffect, useRef, useState, type ReactNode } from "react";
import { newsCategoryNames, type NewsArticle } from "~/domain/news";

// Noticias y Resumen comparten la imagen aprobada y el mismo reemplazo ante fallos.
export function NewsArtwork({
  imageUrl,
  category,
  children,
}: Pick<NewsArticle, "imageUrl" | "category"> & { children?: ReactNode }) {
  const [failedImage, setFailedImage] = useState<string | null>(null);
  const image = useRef<HTMLImageElement>(null);
  const visibleUrl = imageUrl !== failedImage ? imageUrl : null;
  useEffect(() => {
    // También cubre una imagen fallida antes de hidratar React desde el HTML.
    if (visibleUrl && image.current?.complete && image.current.naturalWidth === 0)
      setFailedImage(visibleUrl);
  }, [visibleUrl]);
  return (
    <div className={`news-artwork news-artwork-${category}`}>
      {visibleUrl ? (
        <img
          key={visibleUrl}
          ref={image}
          src={visibleUrl}
          alt=""
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          onError={() => setFailedImage(visibleUrl)}
        />
      ) : (
        <>
          <svg viewBox="0 0 480 220" aria-hidden="true" focusable="false">
            <path
              className="news-artwork-grid"
              d="M0 55h480M0 110h480M0 165h480M80 0v220M160 0v220M240 0v220M320 0v220M400 0v220"
            />
            <path
              className="news-artwork-bars"
              d="M84 181v-47h28v47m40 0V99h28v82m40 0V115h28v66m40 0V70h28v111m40 0V40h28v141"
            />
            <path className="news-artwork-line" d="m48 147 68-34 52 12 64-62 52 22 70-56 64 12" />
            <circle cx="354" cy="29" r="5" />
          </svg>
          <span className="news-artwork-label">FLUJARIO / {newsCategoryNames[category]}</span>
        </>
      )}
      {children}
    </div>
  );
}
