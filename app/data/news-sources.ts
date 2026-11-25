export const newsSourceIds = [
  "iprofesional",
  "eleconomista",
  "pagina12",
  "infobae",
  "bloomberg",
  "mdz",
] as const;
export type NewsSourceId = (typeof newsSourceIds)[number];
export interface NewsSource {
  id: NewsSourceId;
  name: string;
  sectionUrl: string;
  feedUrls: readonly string[];
  articleHosts: readonly string[];
  // Lectura local y permiso de publicación son alcances distintos.
  publication: "pending" | "approved" | "local-reader";
  permissionReference: string | null;
  termsUrl: string;
  descriptionAllowed: boolean;
  imageAllowed: boolean;
  imageHosts?: readonly string[];
}
export const newsSources: readonly NewsSource[] = [
  {
    id: "iprofesional",
    name: "iProfesional",
    sectionUrl: "https://www.iprofesional.com/economia",
    feedUrls: ["https://www.iprofesional.com/rss/economia"],
    articleHosts: ["www.iprofesional.com", "iprofesional.com"],
    publication: "pending",
    permissionReference: null,
    termsUrl: "https://www.iprofesional.com/contacto",
    descriptionAllowed: false,
    imageAllowed: false,
  },
  {
    id: "eleconomista",
    name: "El Economista",
    sectionUrl: "https://eleconomista.com.ar/economia/",
    feedUrls: ["https://eleconomista.com.ar/economia/feed/"],
    articleHosts: ["eleconomista.com.ar", "www.eleconomista.com.ar"],
    publication: "pending",
    permissionReference: null,
    termsUrl: "https://eleconomista.com.ar/terminos-condiciones",
    descriptionAllowed: false,
    imageAllowed: false,
  },
  {
    id: "pagina12",
    name: "Página/12",
    sectionUrl: "https://www.pagina12.com.ar/secciones/economia",
    feedUrls: ["https://www.pagina12.com.ar/arc/outboundfeeds/rss/secciones/economia/notas/"],
    articleHosts: ["www.pagina12.com.ar", "pagina12.com.ar"],
    publication: "pending",
    permissionReference: null,
    termsUrl: "https://www.pagina12.com.ar/terminos-y-condiciones/",
    descriptionAllowed: false,
    imageAllowed: false,
  },
  {
    id: "infobae",
    name: "Infobae",
    sectionUrl: "https://www.infobae.com/economia/",
    feedUrls: ["https://www.infobae.com/arc/outboundfeeds/rss/"],
    articleHosts: ["www.infobae.com", "infobae.com"],
    publication: "pending",
    permissionReference: null,
    termsUrl: "https://www.infobae.com/terminos-y-condiciones/",
    descriptionAllowed: false,
    imageAllowed: false,
  },
  {
    id: "bloomberg",
    name: "Bloomberg",
    sectionUrl: "https://www.bloomberg.com/economics",
    feedUrls: [
      "https://www.bloomberg.com/feeds/economics/news.rss",
      "https://feeds.bloomberg.com/news.rss",
    ],
    articleHosts: ["www.bloomberg.com", "bloomberg.com"],
    publication: "pending",
    permissionReference: null,
    termsUrl: "https://www.bloomberg.com/notices/tos/",
    descriptionAllowed: false,
    imageAllowed: false,
  },
  {
    id: "mdz",
    name: "MDZ Online",
    sectionUrl: "https://www.mdzol.com/economia",
    feedUrls: ["https://www.mdzol.com/files/rss/mediamzaeconomia.xml"],
    articleHosts: ["www.mdzol.com", "mdzol.com"],
    publication: "pending",
    permissionReference: null,
    termsUrl: "https://www.mdzol.com/p/terminos-y-condiciones",
    descriptionAllowed: false,
    imageAllowed: false,
  },
];
export function sourceIsEnabled(source: NewsSource) {
  return (
    source.publication === "local-reader" ||
    (source.publication === "approved" && Boolean(source.permissionReference?.trim()))
  );
}
// Sólo los puntos de entrada DEV usan este lector solicitado por el usuario.
// No se declara una licencia inexistente ni se activa la republicación en producción.
export function newsSourcesForEnvironment(localReader: boolean): readonly NewsSource[] {
  if (!localReader) return newsSources;
  // Hosts observados en los metadatos RSS; no se aceptan dominios arbitrarios.
  const localImageHosts: Partial<Record<NewsSourceId, readonly string[]>> = {
    iprofesional: ["resizer.iproimg.com"],
    pagina12: ["grupooctubre-pagina12-prod.web.arc-cdn.net"],
    infobae: ["www.infobae.com"],
  };
  return newsSources.map((source) =>
    source.id === "mdz"
      ? source
      : {
          ...source,
          publication: "local-reader" as const,
          descriptionAllowed: false,
          imageAllowed: Boolean(localImageHosts[source.id]?.length),
          imageHosts: localImageHosts[source.id] ?? [],
        },
  );
}
