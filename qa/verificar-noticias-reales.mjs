// Verificación de sólo lectura del caché local. No imprime titulares ni datos personales.
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
const folder = resolve(".wrangler/state/v3/d1/miniflare-D1DatabaseObject");
const files = readdirSync(folder).filter(
  (name) => name.endsWith(".sqlite") && name !== "metadata.sqlite",
);
assert.equal(files.length, 1, "Se esperaba una base local de Flujario.");
const db = new DatabaseSync(resolve(folder, files[0]), { readOnly: true });
try {
  const sources = db
    .prepare(
      "SELECT source,count(*) AS count,min(published_at) AS earliest,max(published_at) AS latest FROM news_articles GROUP BY source ORDER BY source",
    )
    .all();
  assert.deepEqual(
    sources.map((row) => row.source),
    ["bloomberg", "eleconomista", "infobae", "iprofesional", "pagina12"],
  );
  assert(
    sources.every(
      (row) =>
        row.count > 0 &&
        Date.parse(row.latest) <= Date.now() &&
        Date.parse(row.latest) >= Date.now() - 15 * 86400000,
    ),
  );
  assert.equal(
    db.prepare("SELECT count(*) AS n FROM news_articles WHERE description IS NOT NULL").get().n,
    0,
  );
  const imageHosts = new Set([
    "resizer.iproimg.com",
    "grupooctubre-pagina12-prod.web.arc-cdn.net",
    "www.infobae.com",
  ]);
  const images = db
    .prepare("SELECT source,image_url AS url FROM news_articles WHERE image_url IS NOT NULL")
    .all();
  const imagesBySource = {};
  for (const image of images) {
    const url = new URL(image.url);
    assert.equal(url.protocol, "https:");
    assert(imageHosts.has(url.hostname));
    assert.equal(url.username + url.password + url.port, "");
    imagesBySource[image.source] = (imagesBySource[image.source] ?? 0) + 1;
  }
  assert.equal(
    db
      .prepare(
        "SELECT count(*) AS n FROM (SELECT url FROM news_articles GROUP BY url HAVING count(*) > 1)",
      )
      .get().n,
    0,
  );
  const report = {
    checkedAt: new Date().toISOString(),
    scope: "Lector RSS local solicitado; no constituye permiso de republicación pública",
    sources,
    states: db
      .prepare(
        "SELECT source,status,last_success_at AS lastSuccessAt FROM news_sync_state ORDER BY source",
      )
      .all(),
    weekly: db
      .prepare(
        "SELECT e.period,e.from_at AS fromAt,e.to_at AS toAt,count(w.article_id) AS count FROM weekly_news_editions e LEFT JOIN weekly_news_articles w ON w.period=e.period GROUP BY e.period ORDER BY e.period",
      )
      .all(),
    descriptionsStored: false,
    imageUrlsBySource: imagesBySource,
    imageFilesStored: false,
    duplicateUrls: false,
  };
  writeFileSync("qa/noticias-reales-verificacion.json", JSON.stringify(report, null, 2) + "\n");
  console.log(
    JSON.stringify({
      total: sources.reduce((sum, row) => sum + row.count, 0),
      sources: sources.length,
      weeklyEditions: report.weekly.length,
    }),
  );
} finally {
  db.close();
}
