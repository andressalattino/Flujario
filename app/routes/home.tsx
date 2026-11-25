import { Link } from "react-router";
import {
  ArrowUpRight,
  ArrowRight,
  ArrowDownLeft,
  CalendarDays,
  ArrowLeftRight,
  ChartNoAxesCombined,
  FileCheck2,
  Plus,
  Minus,
  Check,
  LockKeyhole,
} from "lucide-react";
import { Brand } from "~/components/brand";
import { Button } from "~/components/ui/button";
import { ProductPreview } from "~/components/landing/product-preview";
import { CurrentFeatures } from "~/components/landing/current-features";
import { useScrollReveal } from "~/components/landing/use-scroll-reveal";
import { ThemePicker } from "~/components/theme";
export const meta = () => [
  { title: "Flujario · Tu dinero, un poco más claro" },
  {
    name: "description",
    content:
      "Organizá movimientos, importá resúmenes, seguí pagos y mercados y entendé tus registros con estadísticas. Tus monedas, siempre separadas.",
  },
];
export default function Home() {
  const revealRoot = useScrollReveal();
  return (
    <div className="landing" ref={revealRoot}>
      <a href="#principal" className="skip-link">
        Saltar al contenido
      </a>
      <header className="site-header">
        <Brand />
        <nav aria-label="Navegación principal" className="site-nav">
          <a href="#como-funciona">Cómo funciona</a>
          <a href="#por-que-flujario">Por qué Flujario</a>
          <a href="#preguntas">Preguntas</a>
        </nav>
        <div className="site-header-actions">
          <ThemePicker />
          <Button asChild size="sm">
            <Link to="/iniciar-sesion">
              Iniciar sesión <ArrowUpRight />
            </Link>
          </Button>
        </div>
      </header>
      <main id="principal">
        <section className="landing-hero container">
          <div className="hero-topline">
            <span className="eyebrow">
              <span className="orange-dot" /> FINANZAS PERSONALES, SIN VUELTAS
            </span>
            <span className="hero-location">HECHO PARA TU DÍA A DÍA</span>
          </div>
          <div className="hero-copy">
            <div>
              <h1>
                Tu dinero.
                <br />
                Un poco más claro.
              </h1>
              <p>
                Lo que entra, lo que sale y lo que viene.
                <br className="desktop-break" /> Un espacio simple para ordenar tus finanzas
                <br className="desktop-break" /> y entenderlas, a tu ritmo.
              </p>
              <div className="hero-actions">
                <Button asChild>
                  <Link to="/crear-cuenta">
                    Empezar a organizarme <ArrowRight />
                  </Link>
                </Button>
                <a className="text-link" href="#como-funciona">
                  Conocer Flujario <ArrowUpRight size={16} />
                </a>
              </div>
              <span className="hero-footnote">
                <LockKeyhole size={13} /> Tu registro es personal. Vos tenés el control.
              </span>
            </div>
            <div className="hero-editorial">
              <span className="editorial-mark" aria-hidden="true">
                ✳
              </span>
              <p>
                No necesitás saber
                <br />
                de economía.
                <br />
                <span>
                  Necesitás un punto
                  <br />
                  de partida.
                </span>
              </p>
              <div className="editorial-rule" />
              <span className="eyebrow">EMPEZÁ POR VERLO</span>
            </div>
          </div>
          <figure className="product-window">
            <div className="window-caption">
              <span>
                <span className="orange-dot" /> UNA MIRADA A TU ESPACIO
              </span>
              <span>Datos ficticios · Vista ilustrativa</span>
            </div>
            <ProductPreview kind="resumen" />
          </figure>
          <div className="feature-strip">
            <span>
              <ArrowDownLeft size={17} /> Ingresos y gastos
            </span>
            <span>
              <CalendarDays size={17} /> Pagos a tiempo
            </span>
            <span>
              <ChartNoAxesCombined size={17} /> Empresas en seguimiento
            </span>
            <span>
              <FileCheck2 size={17} /> Resúmenes y estadísticas
            </span>
          </div>
        </section>
        <section id="como-funciona" className="how-section">
          <div className="container">
            <div className="section-intro" data-reveal>
              <p className="eyebrow">01 / CADA COSA EN SU LUGAR</p>
              <h2>
                Menos cuentas en la cabeza.
                <br />
                Más claridad en tu día.
              </h2>
              <p>
                Flujario reúne lo cotidiano en un solo lugar. Sin planillas interminables, sin
                palabras difíciles y sin mezclar lo que tenés con lo que todavía tenés que pagar.
              </p>
            </div>
            <div className="feature-editorial">
              <div className="feature-text" data-reveal>
                <span className="feature-index">01.1</span>
                <ArrowLeftRight size={26} strokeWidth={1.2} />
                <h3>
                  Seguí el recorrido
                  <br />
                  de tu dinero.
                </h3>
                <p>
                  Anotá un ingreso o un gasto con su importe, fecha y categoría. Consultá tus
                  movimientos y entendé cuánto entra y en qué se va.
                </p>
                <ul>
                  <li>
                    <Check /> Pesos y dólares al comenzar; ocho monedas más para agregar.
                  </li>
                  <li>
                    <Check /> Saldos separados, sin conversiones implícitas.
                  </li>
                  <li>
                    <Check /> Un saldo inicial para empezar desde hoy.
                  </li>
                </ul>
              </div>
              <figure className="feature-image" data-reveal>
                <ProductPreview kind="movimientos" />
                <figcaption>Movimientos · Vista ilustrativa con datos ficticios</figcaption>
              </figure>
            </div>
            <div className="feature-editorial reverse">
              <div className="feature-text" data-reveal>
                <span className="feature-index">01.2</span>
                <CalendarDays size={26} strokeWidth={1.2} />
                <h3>
                  Que un vencimiento
                  <br />
                  no sea una sorpresa.
                </h3>
                <p>
                  Sumá impuestos, servicios y otros compromisos. Elegí si se repiten y marcá cada
                  vencimiento cuando lo pagues.
                </p>
                <ul>
                  <li>
                    <Check /> Pagos únicos, mensuales, trimestrales y anuales.
                  </li>
                  <li>
                    <Check /> Importe variable por mes, editable mientras esté pendiente.
                  </li>
                  <li>
                    <Check /> El gasto se registra al confirmar el pago.
                  </li>
                </ul>
              </div>
              <figure className="feature-image" data-reveal>
                <ProductPreview kind="pagos" />
                <figcaption>Pagos · Vista ilustrativa con datos ficticios</figcaption>
              </figure>
            </div>
            <div className="feature-editorial">
              <div className="feature-text" data-reveal>
                <span className="feature-index">01.3</span>
                <ArrowLeftRight size={26} strokeWidth={1.2} />
                <h3>De una moneda a otra, con claridad.</h3>
                <p>
                  Registrá compras y ventas de moneda sin confundirlas con ingresos o gastos.
                  Consultá referencias del dólar, euro y monedas de la región, con fecha y fuente.
                </p>
                <ul>
                  <li>
                    <Check /> Diez monedas disponibles, cada saldo por separado.
                  </li>
                  <li>
                    <Check /> Cotización sugerida editable antes de registrar.
                  </li>
                  <li>
                    <Check /> Revisión de cuánto entregaste y cuánto recibiste.
                  </li>
                </ul>
              </div>
              <figure className="feature-image" data-reveal>
                <ProductPreview kind="cotizaciones" />
                <figcaption>
                  Cotizaciones · Referencias capturadas con fecha · Fuente:{" "}
                  <a href="https://dolarapi.com" target="_blank" rel="noreferrer">
                    DolarApi
                  </a>
                </figcaption>
              </figure>
            </div>
            <CurrentFeatures />
          </div>
        </section>
        <section id="por-que-flujario" className="difference-section container">
          <div data-reveal>
            <p className="eyebrow">02 / UN ENFOQUE MÁS SIMPLE</p>
            <h2>
              Entender tus finanzas
              <br />
              no debería ser
              <br />
              otro pendiente.
            </h2>
            <p>
              No hace falta que cambies tu vida para llevar un registro. Flujario empieza por lo
              básico y te ayuda a mirar tus números con perspectiva.
            </p>
          </div>
          <div className="principles">
            <article data-reveal>
              <span>01</span>
              <div>
                <h3>Lenguaje de todos los días.</h3>
                <p>
                  Ingresos, gastos y pagos. Las cosas por su nombre, para que puedas usarlas sin
                  aprender un diccionario nuevo.
                </p>
              </div>
            </article>
            <article data-reveal>
              <span>02</span>
              <div>
                <h3>Tu saldo y tus pendientes, separados.</h3>
                <p>
                  Un impuesto por vencer entra en la proyección. Sólo se descuenta de tu saldo
                  cuando registrás que lo pagaste.
                </p>
              </div>
            </article>
            <article data-reveal>
              <span>03</span>
              <div>
                <h3>Tus monedas, sin mezclar.</h3>
                <p>
                  Cada moneda tiene su propia cuenta. Vos elegís cuándo registrar un cambio y cuánto
                  entregaste y recibiste.
                </p>
              </div>
            </article>
          </div>
        </section>
        <section id="preguntas" className="faq-section">
          <div className="container faq-layout">
            <div data-reveal>
              <p className="eyebrow">03 / ANTES DE EMPEZAR</p>
              <h2>
                Las cosas claras,
                <br />
                desde el principio.
              </h2>
            </div>
            <div className="faq-items" data-reveal>
              {[
                [
                  "¿Necesito saber de economía?",
                  "No. Flujario está pensado para registrar lo cotidiano: cuánto recibís, cuánto gastás y qué tenés que pagar. Cada sección explica qué estás viendo.",
                ],
                [
                  "¿Flujario mueve mi dinero?",
                  "No. Podés registrar movimientos manualmente o importar los que revises desde un resumen. Flujario no se conecta a tus bancos ni hace transferencias o pagos. Marcar un pago significa registrar que ya lo hiciste.",
                ],
                [
                  "¿Puedo agregar otras monedas además de pesos y dólares?",
                  "Sí. Empezás con ARS y USD y podés agregar euro, real, peso chileno, peso uruguayo, libra, dólar canadiense, dólar australiano y franco suizo. Cada saldo se mantiene por separado. Comprar o vender moneda registra el cambio que ya hiciste.",
                ],
                [
                  "¿Las cotizaciones y noticias ya están disponibles?",
                  "Las monedas usan DolarApi con fecha y fuente; podés editar la cotización al registrar un cambio. Las acciones muestran precios y gráficos de TradingView, con cobertura y demora según el mercado. Noticias ofrece períodos diario y semanal y enlaces al medio original, según las fuentes habilitadas.",
                ],
                [
                  "¿Qué pasa con mi resumen bancario al importarlo?",
                  "El original se lee en tu dispositivo. Revisás los movimientos, categorías y posibles duplicados antes de confirmar; sólo se guardan los datos confirmados. El OCR puede equivocarse y los formatos bancarios requieren revisión. Un detalle de tarjeta desglosa el pago existente y no crea otro gasto.",
                ],
                [
                  "¿Qué hace Flujario AI?",
                  "Muestra estadísticas objetivas de tus registros con moneda y período. Las preguntas sugeridas funcionan sin IA. Las preguntas libres requieren que la IA esté habilitada y tienen un cupo diario; los cálculos los realiza Flujario. No recomienda inversiones ni modifica movimientos.",
                ],
                [
                  "¿Las vistas de ejemplo muestran datos reales?",
                  "Los saldos y movimientos ilustrados son ficticios y sus controles no guardan cambios. Las cotizaciones son referencias capturadas con fecha y fuente; no se actualizan en esta portada. Al crear tu cuenta empezás con tu propio registro.",
                ],
              ].map(([question, answer]) => (
                <details key={question}>
                  <summary>
                    {question}
                    <Plus className="faq-plus" size={17} />
                    <Minus className="faq-minus" size={17} />
                  </summary>
                  <p>{answer}</p>
                </details>
              ))}
            </div>
          </div>
        </section>
        <section className="closing-section container">
          <span className="editorial-mark" aria-hidden="true">
            ✳
          </span>
          <div data-reveal>
            <p className="eyebrow">UN REGISTRO A LA VEZ</p>
            <h2>
              Hacé lugar para
              <br />
              un poco de claridad.
            </h2>
          </div>
          <div data-reveal>
            <Button asChild>
              <Link to="/crear-cuenta">
                Crear mi cuenta <ArrowUpRight />
              </Link>
            </Button>
            <p>Empezá con lo que sabés hoy.</p>
          </div>
        </section>
      </main>
      <footer className="site-footer container">
        <Brand compact />
        <span>Tu dinero, a tu ritmo.</span>
        <Link to="/iniciar-sesion">
          Iniciar sesión <ArrowUpRight size={14} />
        </Link>
        <small>
          Flujario es una herramienta de registro. No brinda asesoramiento de inversión.
        </small>
      </footer>
    </div>
  );
}
