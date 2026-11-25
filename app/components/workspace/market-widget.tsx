import { useEffect, useRef, useState } from "react";
import { useResolvedTheme } from "../theme";
import { ExternalLink, RotateCcw } from "lucide-react";
import { Button } from "../ui/button";
import {
  marketWidgetAttributes,
  TRADINGVIEW_MARKET_MODULE,
  TRADINGVIEW_RADAR_MODULE,
  TRADINGVIEW_MARKETS_URL,
  type MarketWidgetView,
} from "~/domain/tradingview-widget";
import "~/market-widget.css";

const moduleRequests = new Map<string, Promise<void>>();
function widgetTag(compact: boolean) {
  return compact ? "tv-market-summary" : "tv-market-data";
}
function loadMarketModule(compact: boolean) {
  const tag = widgetTag(compact);
  if (customElements.get(tag)) return Promise.resolve();
  const pending = moduleRequests.get(tag);
  if (pending) return pending;
  const request = new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    const finish = (error?: Error) => {
      window.clearTimeout(timeout);
      script.onload = null;
      script.onerror = null;
      if (error) {
        script.remove();
        reject(error);
      } else resolve();
    };
    const timeout = window.setTimeout(() => finish(new Error("TradingView no respondió")), 20000);
    script.type = "module";
    script.src = compact ? TRADINGVIEW_RADAR_MODULE : TRADINGVIEW_MARKET_MODULE;
    script.onload = () =>
      finish(customElements.get(tag) ? undefined : new Error("Componente no disponible"));
    script.onerror = () => finish(new Error("No se pudo cargar TradingView"));
    document.head.appendChild(script);
  }).catch((error) => {
    moduleRequests.delete(tag);
    throw error;
  });
  moduleRequests.set(tag, request);
  return request;
}

export function MarketWidget({
  symbols,
  title,
  view = "performance",
  compact = false,
}: {
  symbols: string[];
  title: string;
  view?: MarketWidgetView;
  compact?: boolean;
}) {
  const theme = useResolvedTheme();
  const [status, setStatus] = useState<"loading" | "module-ready" | "error">("loading");
  const [attempt, setAttempt] = useState(0);
  const host = useRef<HTMLDivElement>(null);
  const symbolKey = symbols.join(",");
  useEffect(() => {
    if (!host.current || !theme || !symbolKey) return;
    setStatus("loading");
    let disposed = false;
    const widget = document.createElement(widgetTag(compact));
    for (const [key, value] of Object.entries(
      marketWidgetAttributes({ symbols: symbolKey.split(","), view, theme, compact }),
    ))
      widget.setAttribute(key, value);
    host.current.replaceChildren(widget);
    loadMarketModule(compact)
      .then(() => {
        if (!disposed) setStatus("module-ready");
      })
      .catch(() => {
        if (!disposed) setStatus("error");
      });
    return () => {
      disposed = true;
      widget.remove();
    };
  }, [symbolKey, theme, view, compact, attempt]);
  if (!symbols.length)
    return (
      <p className="market-widget-note">
        Esta selección no tiene símbolos con una referencia de TradingView verificada.
      </p>
    );
  return (
    <div className={`market-widget ${compact ? "is-compact" : ""}`}>
      {!compact && (
        <p className="market-widget-scroll-hint">
          Deslizá la tabla hacia los costados para ver todas las columnas.
        </p>
      )}
      <div
        className="market-widget-frame"
        role="group"
        aria-label={title}
        tabIndex={compact ? undefined : 0}
      >
        <div className="market-widget-host" ref={host} />
        {status === "loading" && (
          <p className="market-widget-loading" role="status">
            Cargando TradingView…
          </p>
        )}
      </div>
      {status === "error" && (
        <div className="market-widget-error" role="status">
          <p>
            La carga no se pudo completar. Si la tabla no aparece, reintentá o abrí TradingView.
          </p>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              setStatus("loading");
              setAttempt((n) => n + 1);
            }}
          >
            <RotateCcw />
            Reintentar
          </Button>
        </div>
      )}
      <p className="market-widget-attribution">
        <span>Datos y tabla de TradingView</span>
        <a href={TRADINGVIEW_MARKETS_URL} target="_blank" rel="noopener noreferrer">
          Abrir TradingView <ExternalLink size={12} />
        </a>
      </p>
    </div>
  );
}
