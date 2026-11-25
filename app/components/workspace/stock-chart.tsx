import { useEffect, useRef, useState } from "react";
import { useResolvedTheme } from "../theme";
import { ExternalLink } from "lucide-react";
import { chartConfiguration, tradingviewUrl, type StockCompany } from "~/domain/markets";
export function StockChart({ company }: { company: StockCompany }) {
  const host = useRef<HTMLDivElement>(null);
  const theme = useResolvedTheme();
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!host.current || !theme || !company.tradingviewSymbol) return;
    setFailed(false);
    let disposed = false;
    const container = document.createElement("div");
    container.className = "tradingview-widget-container";
    container.style.height = "100%";
    container.style.width = "100%";
    const content = document.createElement("div");
    content.className = "tradingview-widget-container__widget";
    content.style.height = "100%";
    content.style.width = "100%";
    const script = document.createElement("script");
    script.src = "https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js";
    script.async = true;
    script.type = "text/javascript";
    script.textContent = JSON.stringify(chartConfiguration(company.tradingviewSymbol, theme));
    script.onerror = () => {
      if (!disposed) setFailed(true);
    };
    container.appendChild(content);
    container.appendChild(script);
    host.current.appendChild(container);
    return () => {
      disposed = true;
      script.onerror = null;
      container.remove();
    };
  }, [company.tradingviewSymbol, theme]);
  const url = tradingviewUrl(company);
  return (
    <div className="stock-chart-panel">
      <div className="stock-chart-heading">
        <div>
          <span className="eyebrow">GRÁFICO DE TU FAVORITA</span>
          <h3>
            {company.name} <span>{company.symbol}</span>
          </h3>
        </div>
        {url && (
          <a className="text-link small" href={url} target="_blank" rel="noopener noreferrer">
            Abrir en TradingView <ExternalLink size={13} />
          </a>
        )}
      </div>
      {url ? (
        <>
          <div
            className="stock-chart-frame"
            ref={host}
            role="group"
            aria-label={`Gráfico de ${company.name} provisto por TradingView`}
          />
          {failed && (
            <p role="status">
              El gráfico no pudo cargar. Podés abrirlo en TradingView desde el enlace.
            </p>
          )}
          <p className="stock-chart-note">
            Gráfico provisto por{" "}
            <a href={url} target="_blank" rel="noopener noreferrer">
              TradingView
            </a>
            . Cambiá el período desde sus controles. Cobertura y demora según la fuente del widget ·
            Horario del gráfico: UTC.
          </p>
        </>
      ) : (
        <p className="stock-chart-note">
          Este símbolo anterior no tiene un gráfico verificado. Podés quitarlo y elegir una acción
          del catálogo actual.
        </p>
      )}
    </div>
  );
}
