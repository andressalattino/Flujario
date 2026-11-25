import { ChartNoAxesCombined, FileCheck2, MessagesSquare, Newspaper, Check } from "lucide-react";
import { ProductPreview, type PreviewKind } from "./product-preview";
const features = [
  {
    kind: "importacion",
    index: "01.4",
    icon: FileCheck2,
    title: "Del resumen a tus movimientos.",
    text: "Leé PDF, CSV o Excel en tu dispositivo. Revisá fechas, importes y categorías antes de confirmar. Después, explorá el balance y creá gráficos.",
    items: [
      "PDF digital u OCR asistido para escaneados.",
      "Avisos de posibles duplicados y revisión obligatoria.",
      "Detalle de tarjeta sin duplicar el pago del resumen.",
    ],
    status: "Lectura asistida · El archivo original no se sube",
  },
  {
    kind: "mercados",
    index: "01.5",
    icon: ChartNoAxesCombined,
    title: "Encontrá tus próximas favoritas.",
    text: "Explorá S&P 100 y Nasdaq-100, buscá por nombre o símbolo y seguí hasta cinco acciones. Consultá precios, variaciones y gráficos de TradingView.",
    items: [
      "Favoritas compartidas entre ambos índices y en Resumen.",
      "Catálogo revisado cada 15 días desde Wikipedia.",
      "Fuente y fecha visibles; cobertura y demora según el mercado.",
    ],
    status: "Seguimiento informativo · No ejecuta inversiones",
  },
  {
    kind: "asistente",
    index: "01.6",
    icon: MessagesSquare,
    title: "Preguntá. Mirá tus números.",
    text: "Abrí el chat de Flujario AI para entender tus ingresos, gastos y categorías. Las respuestas muestran período, moneda, tablas y gráficos a partir de tus registros.",
    items: [
      "Preguntas estadísticas sin consumir el cupo de IA.",
      "Conversación disponible mientras recorrés el panel.",
      "Análisis objetivo, sin recomendaciones de inversión.",
    ],
    status: "Estadísticas disponibles · Texto libre sujeto a habilitación y cupo",
  },
  {
    kind: "noticias",
    index: "01.7",
    icon: Newspaper,
    title: "La actualidad, con su origen.",
    text: "Recorré noticias económicas del día o la edición semanal de los lunes. Elegí diarios favoritos para Resumen y abrí cada artículo en su medio original.",
    items: [
      "Hasta cinco noticias económicas por diario y opción de ver más.",
      "Imágenes cuando están disponibles y habilitadas.",
      "Guardadas para leer después; vencen con el historial a los 15 días.",
    ],
    status: "Contenido según fuentes habilitadas · Enlaces al original",
  },
] satisfies {
  kind: PreviewKind;
  index: string;
  icon: typeof Check;
  title: string;
  text: string;
  items: string[];
  status: string;
}[];
export function CurrentFeatures() {
  return features.map(({ kind, index, icon: Icon, title, text, items, status }, position) => (
    <div key={kind} className={`feature-editorial ${position % 2 ? "reverse" : ""}`}>
      <div className="feature-text" data-reveal>
        <span className="feature-index">{index}</span>
        <Icon size={26} strokeWidth={1.2} />
        <h3>{title}</h3>
        <p>{text}</p>
        <ul>
          {items.map((item) => (
            <li key={item}>
              <Check />
              {item}
            </li>
          ))}
        </ul>
        <span className="availability">{status}</span>
      </div>
      <figure className="feature-image" data-reveal>
        <ProductPreview kind={kind} />
        <figcaption>
          {kind === "asistente"
            ? "Flujario AI"
            : kind === "importacion"
              ? "Importación de resúmenes"
              : kind === "mercados"
                ? "Mercados"
                : "Noticias"}{" "}
          · Vista ilustrativa con datos ficticios
        </figcaption>
      </figure>
    </div>
  ));
}
