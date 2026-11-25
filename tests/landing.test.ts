import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { expect, it, vi } from "vitest";
import Home from "../app/routes/home";
import { ProductPreview } from "../app/components/landing/product-preview";
import { ThemeProvider } from "../app/components/theme";

it("la portada sirve contenido completo sin JavaScript, sesión ni consultas de datos", () => {
  const fetcher = vi
    .spyOn(globalThis, "fetch")
    .mockRejectedValue(new Error("No debe consultar fuentes desde la portada."));
  try {
    const html = renderToStaticMarkup(
      createElement(MemoryRouter, null, createElement(ThemeProvider, null, createElement(Home))),
    );
    expect(html).toContain("Tu dinero.");
    expect(html).toContain("Que un vencimiento");
    expect(html).toContain("Preguntas");
    expect(html).toContain('href="/crear-cuenta"');
    expect(html).not.toContain("data-reveal-state");
    expect(html).not.toMatch(/panel-.*\.(jpg|png)/);
    expect(html).not.toContain("/app/cotizaciones/datos");
    expect(fetcher).not.toHaveBeenCalled();
    expect(html).toContain("Del resumen a tus movimientos.");
    expect(html).toContain("Flujario AI");
    expect(html).toContain("TradingView");
    expect(html).not.toContain("Cotizaciones en preparación");
    expect(html).not.toContain("/app/asistente/datos");
    expect(html).not.toContain("embed-widget");
  } finally {
    fetcher.mockRestore();
  }
});

it.each([
  "resumen",
  "movimientos",
  "pagos",
  "cotizaciones",
  "mercados",
  "importacion",
  "asistente",
  "noticias",
] as const)("la ilustración %s se identifica y sus controles permanecen inertes", (kind) => {
  const html = renderToStaticMarkup(
    createElement(MemoryRouter, null, createElement(ProductPreview, { kind })),
  );
  expect(html).toContain('role="img"');
  expect(html).toContain('aria-label="Ejemplo de');
  expect(html).toContain('inert=""');
  expect(html).not.toMatch(/<(form|input|select)\b/);
  expect(html).not.toContain("/app/");
  if (kind === "cotizaciones") {
    expect(html).toContain("DolarApi");
    expect(html).toContain("No se actualizan");
    expect(html).toContain("17/11/26");
  } else expect(html).toMatch(/fictici[oa]s?|No son noticias reales/);
});
