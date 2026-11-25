import { expect, it } from "vitest";
import { newsSources, type NewsSource } from "../app/data/news-sources";
import {
  canonicalNewsUrl,
  feedPublishedAt,
  parseNewsFeed,
  plainFeedText,
} from "../app/services/rss.server";
const now = new Date("2026-11-18T18:00:00Z");
const source = newsSources[0]!;
const item = (extra = "", link = "https://www.iprofesional.com/economia/1-noticia") =>
  `<item><title><![CDATA[Inflación &amp; tasas <b>de prueba</b>]]></title><link>${link}</link><pubDate>Wed, 18 Nov 2026 15:00:00 GMT</pubDate>${extra}</item>`;
const rss = (items: string) =>
  `<rss version="2.0"><channel><title>Prueba</title><language>es</language>${items}</channel></rss>`;
it("valida RSS, normaliza UTC, quita HTML y no guarda cuerpo ni imagen sin permiso", () => {
  const rows = parseNewsFeed(
    rss(
      item(
        '<description>Texto protegido</description><enclosure url="https://foto.example/a.jpg" type="image/jpeg"/>',
      ),
    ),
    source,
    now,
  );
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({
    title: "Inflación & tasas de prueba",
    publishedAt: "2026-11-18T15:00:00.000Z",
    description: null,
    imageUrl: null,
    category: "economia",
  });
});
it("procesa Atom con espacios de nombres y enlace alternate", () => {
  const xml = `<feed xmlns="http://www.w3.org/2005/Atom"><entry><title>Noticia económica de prueba</title><id>abc</id><published>2026-11-18T12:00:00-03:00</published><link rel="self" href="https://mal.example"/><link rel="alternate" href="https://www.iprofesional.com/finanzas/2"/></entry></feed>`;
  expect(parseNewsFeed(xml, source, now)[0]).toMatchObject({
    category: "finanzas",
    externalId: "abc",
    publishedAt: "2026-11-18T15:00:00.000Z",
  });
});
it("rechaza XML roto, HTML, DTD y entidades externas", () => {
  for (const xml of [
    "<rss><channel></rss>",
    "<html><body>error</body></html>",
    '<!DOCTYPE rss [<!ENTITY x SYSTEM "https://evil.example">]><rss/>',
  ])
    expect(() => parseNewsFeed(xml, source, now)).toThrow();
});
it("rechaza fechas futuras, sin zona e imposibles; admite bisiestos válidos", () => {
  for (const date of [
    "2026-11-19T00:00:00Z",
    "2026-11-18T12:00:00",
    "2026-02-30T12:00:00Z",
    "Fri, 30 Feb 2024 12:00:00 GMT",
    "basura",
  ])
    expect(feedPublishedAt(date, now)).toBeNull();
  expect(feedPublishedAt("2024-02-29T15:00:00-03:00", now)).toBe("2024-02-29T18:00:00.000Z");
});
it("elimina parámetros de seguimiento sin perder parámetros funcionales y deduplica URL", () => {
  expect(
    canonicalNewsUrl("https://www.iprofesional.com/economia/1?id=2&utm_source=reader#x", source),
  ).toBe("https://www.iprofesional.com/economia/1?id=2");
  expect(
    parseNewsFeed(
      rss(item() + item("", "https://www.iprofesional.com/economia/1-noticia?utm_source=otra")),
      source,
      now,
    ),
  ).toHaveLength(1);
  for (const url of [
    "javascript:alert(1)",
    "http://www.iprofesional.com/economia/1",
    "https://www.iprofesional.com.evil.example/1",
    "https://user:pass@www.iprofesional.com/1",
  ])
    expect(canonicalNewsUrl(url, source)).toBeNull();
});
it("Infobae sólo acepta economía fiable y no rellena con otras secciones", () => {
  const infobae = newsSources.find((row) => row.id === "infobae")!;
  const xml = rss(
    item("", "https://www.infobae.com/economia/2026/11/18/prueba/") +
      item("", "https://www.infobae.com/politica/2026/11/18/prueba/"),
  );
  expect(parseNewsFeed(xml, infobae, now)).toHaveLength(1);
});
it("el alternativo general de Bloomberg necesita metadatos económicos", () => {
  const bloomberg = newsSources.find((row) => row.id === "bloomberg")!;
  const xml = rss(item("", "https://www.bloomberg.com/news/articles/prueba"));
  expect(parseNewsFeed(xml, bloomberg, now, true)).toHaveLength(0);
  expect(
    parseNewsFeed(
      rss(item("<category>Economics</category>", "https://www.bloomberg.com/news/articles/prueba")),
      bloomberg,
      now,
      true,
    ),
  ).toHaveLength(1);
});
it("limita entradas y descripciones autorizadas sin usar content:encoded", () => {
  const approved: NewsSource = { ...source, descriptionAllowed: true };
  expect(
    parseNewsFeed(rss(item(`<description>${"a".repeat(400)}</description>`)), approved, now)[0]
      ?.description,
  ).toHaveLength(280);
  expect(() => parseNewsFeed(rss(item().repeat(501)), source, now)).toThrow();
  expect(plainFeedText("&lt;script&gt;alert(1)&lt;/script&gt; Texto", 100)).toBe("Texto");
});
it("sólo admite imágenes con permiso y host configurado", () => {
  const image = '<enclosure url="https://cdn.example/imagen.jpg" type="image/jpeg"/>';
  expect(
    parseNewsFeed(rss(item(image)), { ...source, imageAllowed: true }, now)[0]?.imageUrl,
  ).toBeNull();
  expect(
    parseNewsFeed(
      rss(item(image)),
      { ...source, imageAllowed: true, imageHosts: ["cdn.example"] },
      now,
    )[0]?.imageUrl,
  ).toBe("https://cdn.example/imagen.jpg");
});
it("acepta HTML literal en CDATA sin interpretarlo como un DTD ni guardar el cuerpo", () => {
  const xml = rss(
    item(
      "<description><![CDATA[<!DOCTYPE html><html><body>Contenido no publicado</body></html>]]></description>",
    ),
  );
  expect(parseNewsFeed(xml, source, now)).toHaveLength(1);
  expect(parseNewsFeed(xml, source, now)[0]?.description).toBeNull();
});
it("un CDATA inocuo no oculta declaraciones XML reales antes o después del bloque", () => {
  const literal = item("<description><![CDATA[<!DOCTYPE html>]]></description>");
  for (const xml of [
    '<!DOCTYPE rss [<!ENTITY xxe SYSTEM "https://evil.example/private">]>' + rss(literal),
    rss(literal + '<!ENTITY xxe SYSTEM "https://evil.example/private">'),
    rss(literal + "<description><![CDATA[sin cerrar</description>"),
  ])
    expect(() => parseNewsFeed(xml, source, now)).toThrow();
});
it("las fotos del lector sólo pueden usar HTTPS y el host exacto configurado", () => {
  const local = { ...source, imageAllowed: true, imageHosts: ["resizer.iproimg.com"] };
  for (const url of [
    "https://resizer.iproimg.com.evil.example/foto.jpg",
    "https://resizer.iproimg.com@evil.example/foto.jpg",
    "http://resizer.iproimg.com/foto.jpg",
    "https://resizer.iproimg.com:444/foto.jpg",
    "data:image/svg+xml,svg",
  ])
    expect(
      parseNewsFeed(rss(item(`<enclosure url="${url}" type="image/jpeg"/>`)), local, now)[0]
        ?.imageUrl,
    ).toBeNull();
  expect(
    parseNewsFeed(
      rss(item('<enclosure url="https://resizer.iproimg.com/foto.jpg" type="image/jpeg"/>')),
      local,
      now,
    )[0]?.imageUrl,
  ).toBe("https://resizer.iproimg.com/foto.jpg");
});
it("un CDATA escrito dentro de comentarios o instrucciones no puede ocultar un DTD real", () => {
  const dtd = '<!DOCTYPE rss [<!ENTITY xxe SYSTEM "https://evil.example/private">]>';
  for (const xml of [
    "<!-- <![CDATA[ -->" + dtd + "<!-- ]]> -->" + rss(item()),
    "<?reader <![CDATA[ ?>" + dtd + "<?reader ]]> ?>" + rss(item()),
    rss(
      item("<description><![CDATA[<!--]]></description>") +
        '<!ENTITY xxe "x">' +
        "<description><![CDATA[-->]]></description>",
    ),
  ])
    expect(() => parseNewsFeed(xml, source, now)).toThrow();
});
