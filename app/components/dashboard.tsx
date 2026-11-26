import type { Modal, Open } from "./workspace/types";
import { Field, Select } from "./workspace/shared";
import { Overview } from "./workspace/overview";
import { Movements } from "./workspace/movements";
import { Payments } from "./workspace/payments";
import { Markets } from "./workspace/stock-markets";
import { News } from "./workspace/news";
import { PaymentNotice } from "./workspace/payment-notice";
import { NewPaymentFields, ExistingPaymentFields } from "./workspace/payment-fields";
import { AddCurrencyFields, EntryFields } from "./workspace/currency-fields";
import { ExchangeFields } from "./workspace/exchange-fields";
import { Quotes } from "./workspace/quotes";
import { Statistics } from "./workspace/statistics";
import { availableCurrencies, currencyOptions, isCurrency } from "~/domain/currencies";
import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { ThemePicker } from "./theme";
import { balanceView } from "./workspace/balance-focus";
import {
  Link,
  NavLink,
  useFetcher,
  useParams,
  useSearchParams,
  useRevalidator,
  useNavigation,
} from "react-router";
import { UserButton } from "@clerk/react-router";
import {
  ArrowUpRight,
  ArrowRight,
  Plus,
  LayoutDashboard,
  ArrowLeftRight,
  CalendarDays,
  ChartColumn,
  ChartNoAxesCombined,
  Newspaper,
  Check,
  Menu,
  X,
} from "lucide-react";
import { Brand } from "./brand";
import { Button } from "./ui/button";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "./ui/dialog";
import type { Currency } from "~/domain/money";
import type { Snapshot } from "~/domain/finance";
import { today } from "~/domain/dates";
import { paymentFilter, selectedPaymentMonth } from "~/domain/payments";
import { validateSection, type Section } from "~/lib/sections";
import type { StatisticsPageData } from "~/domain/statistics";

const nav = [
  { slug: "resumen", title: "Resumen", icon: LayoutDashboard },
  { slug: "movimientos", title: "Movimientos", icon: ArrowLeftRight },
  { slug: "estadisticas", title: "Estadísticas", icon: ChartColumn },
  { slug: "pagos", title: "Pagos", icon: CalendarDays },
  { slug: "cotizaciones", title: "Cotizaciones", icon: ArrowLeftRight },
  { slug: "mercados", title: "Mercados", icon: ChartNoAxesCombined },
  { slug: "noticias", title: "Noticias", icon: Newspaper },
] as const;
type Result = {
  ok: boolean;
  error: string | null;
  message?: string | null;
  refresh?: boolean;
  nextCurrency?: Currency | null;
};

export function Dashboard({
  snapshot,
  preview = false,
  newsExample = false,
  statistics,
}: {
  snapshot: Snapshot;
  preview?: boolean;
  newsExample?: boolean;
  statistics?: StatisticsPageData | null;
}) {
  const section = validateSection(useParams().section);
  const [params, setParams] = useSearchParams();
  const navigation = useNavigation();
  const paramsRef = useRef(params);
  useEffect(() => {
    if (navigation.state === "idle") paramsRef.current = params;
  }, [params, navigation.state]);
  const owned = snapshot.accounts.map((account) => account.currency);
  const currencyParam = params.get("moneda");
  const [requested, setRequested] = useState(currencyParam);
  useEffect(() => setRequested(currencyParam), [currencyParam]);
  const currency: Currency =
    isCurrency(requested) && owned.includes(requested) ? requested : (owned[0] ?? "ARS");
  const base = preview ? "/vista-previa" : "/app";
  const [menuOpen, setMenuOpen] = useState(false);
  const menuId = useId();
  const menuButton = useRef<HTMLButtonElement>(null);
  useEffect(() => setMenuOpen(false), [section]);
  function closeMenu() {
    setMenuOpen(false);
    menuButton.current?.focus({ preventScroll: true });
  }
  const [modal, setModal] = useState<Modal>(null);
  const [requestKey, setRequestKey] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [noticeSnoozed, setNoticeSnoozed] = useState(false);
  const fetcher = useFetcher<Result>();
  const revalidator = useRevalidator();
  const pending = fetcher.state !== "idle";
  const open: Open = (value) => {
    setError(null);
    setNotice("");
    setRequestKey(crypto.randomUUID());
    setModal(value);
  };
  useEffect(() => {
    if (fetcher.state !== "idle" || !fetcher.data) return;
    if (fetcher.data.ok) {
      setModal(null);
      setNotice(fetcher.data.message || "Guardado. Tu información está actualizada.");
      setError(null);
      if (fetcher.data.nextCurrency) updateParam("moneda", fetcher.data.nextCurrency);
    } else {
      setError(fetcher.data.error);
      if (fetcher.data.refresh) revalidator.revalidate();
    }
  }, [fetcher.data, fetcher.state]);
  const waitingForNews = snapshot.news?.sources.some(
    (source) =>
      !source.lastSuccessAt && (source.status === "idle" || source.status === "refreshing"),
  );
  useEffect(() => {
    if (preview && (newsExample || !snapshot.news)) return;
    const refreshDate = () => {
      if (
        document.visibilityState === "visible" &&
        ((!preview && today() !== snapshot.asOf) ||
          ((section === "resumen" || section === "noticias") &&
            snapshot.news &&
            Date.now() - Date.parse(snapshot.news.asOf) >=
              (waitingForNews ? 15000 : 30 * 60 * 1000))) &&
        revalidator.state === "idle"
      )
        revalidator.revalidate();
    };
    const timer = window.setInterval(refreshDate, waitingForNews ? 15000 : 60000);
    window.addEventListener("focus", refreshDate);
    document.addEventListener("visibilitychange", refreshDate);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", refreshDate);
      document.removeEventListener("visibilitychange", refreshDate);
    };
  }, [
    preview,
    newsExample,
    snapshot.asOf,
    snapshot.news?.asOf,
    waitingForNews,
    section,
    revalidator,
  ]);
  function updateParam(key: string, value: string) {
    // El snapshot ya incluye todas las monedas del dueño. Selector y cifras
    // cambian juntos, sin esperar a que termine la navegación de la URL.
    if (key === "moneda") setRequested(value);
    // Combina cambios rápidos aunque la navegación anterior todavía esté cargando.
    const next = new URLSearchParams(paramsRef.current);
    value ? next.set(key, value) : next.delete(key);
    paramsRef.current = next;
    setParams(next, { replace: true, preventScrollReset: section === "mercados" });
  }
  function submitPreview(event: FormEvent<HTMLFormElement>) {
    if (preview) {
      event.preventDefault();
      setError(
        "Esta es una vista previa con datos ficticios. Los formularios no guardan información.",
      );
    } else setError(null);
  }
  const month = new Intl.DateTimeFormat("es-AR", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${snapshot.asOf}T12:00:00Z`));
  const modalCopy =
    modal && typeof modal === "object"
      ? modal.kind === "edit-expense"
        ? {
            title: "Editar gasto",
            description: modal.expense.imported
              ? "Podés corregir la descripción y la categoría. El importe y la fecha vienen del resumen."
              : "Corregí los datos del gasto. Flujario conserva los valores anteriores en el historial.",
          }
        : modal.kind === "pay"
          ? {
              title: "Registrar un pago.",
              description:
                "Confirmá cuánto pagaste. Flujario registra el gasto y marca este vencimiento como pagado; no mueve dinero.",
            }
          : {
              title: "Editar el importe.",
              description:
                "Ajustá el monto previsto de este vencimiento y elegí qué hacer con los siguientes.",
            }
      : {
          setup: {
            title: "Tu punto de partida.",
            description: "Ingresá tus saldos actuales. Podés dejar ambos en cero.",
          },
          entry: {
            title: "Anotá un movimiento.",
            description: "Registrá dinero que ya recibiste o pagaste.",
          },
          payment: {
            title: "Un pago, bajo control.",
            description: "Un vencimiento pendiente no modifica tu saldo actual.",
          },
          exchange: {
            title: "Registrar un cambio.",
            description:
              "Anotá un cambio que ya hiciste. Revisá lo que entregaste, lo que recibiste y la cotización usada.",
          },
          "add-currency": {
            title: "Una moneda más.",
            description:
              "Agregá una moneda para registrar su saldo, movimientos y pagos por separado.",
          },
        }[modal ?? "entry"];
  const paymentNotice = !noticeSnoozed && (
    <PaymentNotice
      snapshot={snapshot}
      base={base}
      busy={pending}
      onLater={() => {
        setNoticeSnoozed(true);
        setNotice("Te lo recordaremos la próxima vez que entres al panel.");
      }}
      onDismiss={() => {
        if (preview) {
          setNotice(
            "La vista previa no guarda preferencias. En tu cuenta se silenciarán sólo los vencimientos de este aviso.",
          );
          return;
        }
        if (snapshot.paymentNoticeFingerprint)
          fetcher.submit(
            {
              intent: "dismiss-payment-notices",
              fingerprint: snapshot.paymentNoticeFingerprint,
            },
            { method: "post", action: `${base}/${section}` },
          );
      }}
    />
  );
  return (
    <div className="dashboard-shell">
      <a className="skip-link" href="#contenido">
        Saltar al contenido
      </a>
      <aside
        className="sidebar"
        data-nav-open={menuOpen}
        onKeyDown={(event) => {
          if (event.key === "Escape" && menuOpen && menuButton.current?.getClientRects().length) {
            event.preventDefault();
            closeMenu();
          }
        }}
      >
        <Brand compact />
        <Button
          ref={menuButton}
          type="button"
          variant="outline"
          className="sidebar-menu-toggle"
          aria-expanded={menuOpen}
          aria-controls={menuId}
          onClick={() => setMenuOpen((open) => !open)}
        >
          {menuOpen ? <X aria-hidden="true" /> : <Menu aria-hidden="true" />}
          <span>{menuOpen ? "Cerrar menú" : "Menú"}</span>
        </Button>
        <div className="sidebar-label">TU ESPACIO</div>
        <nav id={menuId} aria-label="Secciones del panel">
          {nav.map(({ slug, title, icon: Icon }) => (
            <NavLink
              key={slug}
              to={`${base}/${slug}?moneda=${currency}`}
              className={() => `sidebar-link ${section === slug ? "is-active" : ""}`}
              aria-current={section === slug ? "page" : undefined}
              onClick={() => {
                if (menuOpen && menuButton.current?.getClientRects().length) closeMenu();
              }}
            >
              <Icon size={18} strokeWidth={1.5} />
              <span>{title}</span>
              {section === slug && <span className="active-dot" />}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-note">
          <span className="tiny-sun" aria-hidden="true">
            ✳
          </span>
          <p>
            Las cuentas claras.
            <br />
            La cabeza tranquila.
          </p>
        </div>
        <div className="sidebar-bottom">
          {preview ? <div className="avatar">F</div> : <UserButton />}
          <span>
            {preview ? "Cuenta de ejemplo" : "Mi cuenta"}
            <small>{preview ? "Vista previa local" : "Espacio personal"}</small>
          </span>
        </div>
      </aside>
      <div className="dashboard-body">
        <header className="dashboard-topbar">
          <div className="breadcrumbs">
            MI ESPACIO <span>/</span> {nav.find((n) => n.slug === section)?.title.toUpperCase()}
          </div>
          <div className="topbar-controls">
            <ThemePicker />
            <Link className="topbar-about" to="/#como-funciona">
              Acerca de Flujario <ArrowUpRight size={14} />
            </Link>
          </div>
        </header>
        <main id="contenido" className="dashboard-main">
          {preview && (
            <div className="preview-notice">
              VISTA PREVIA LOCAL{" "}
              <span>
                {newsExample &&
                  "NOTICIAS FICTICIAS DE PRUEBA. Los titulares y las preferencias de medios son ejemplos; los enlaces llevan a example.com. "}
                {!newsExample && snapshot.news && "Noticias reales de RSS, con enlaces al diario. "}
                Saldos y movimientos ficticios. Las cotizaciones y noticias indican su fuente y
                fecha. Los formularios no guardan.
              </span>
            </div>
          )}
          <div className="page-heading">
            <div>
              {section !== "estadisticas" && (
                <p className="eyebrow">
                  {section === "resumen" ? month : "UN LUGAR PARA CADA COSA"}
                </p>
              )}
              <h1>
                {
                  {
                    resumen: "Tu dinero, en perspectiva.",
                    movimientos: "Lo que entra. Lo que sale.",
                    estadisticas: "Estadísticas",
                    pagos: "Que no se te pase nada.",
                    cotizaciones: "Las monedas, en contexto.",
                    mercados: "Una mirada al mercado.",
                    noticias: "Actualidad financiera",
                  }[section]
                }
              </h1>
              <p>
                {
                  {
                    resumen: "Un vistazo simple para saber dónde estás y qué viene.",
                    movimientos: "Registrá tus ingresos y gastos, sin perder el hilo.",
                    estadisticas:
                      "Compará cómo cambiaron tus ingresos y gastos a lo largo del tiempo.",
                    pagos: "Tus impuestos, servicios y próximos compromisos, en orden.",
                    cotizaciones:
                      "Dólar, euro y monedas de la región. Cada referencia, con su fecha.",
                    mercados: "Seguí las empresas que te interesan, a tu ritmo.",
                    noticias: "Las noticias económicas más recientes, en un solo lugar.",
                  }[section]
                }
              </p>
            </div>
            {section !== "noticias" && section !== "mercados" && section !== "estadisticas" && (
              <div className="page-actions">
                {(section === "resumen" || section === "movimientos") && owned.length >= 2 && (
                  <Button variant="outline" onClick={() => open("exchange")}>
                    <ArrowLeftRight />
                    Comprar / vender moneda
                  </Button>
                )}
                <Button
                  onClick={() =>
                    open(
                      snapshot.accounts.length
                        ? section === "cotizaciones"
                          ? "exchange"
                          : section === "pagos"
                            ? "payment"
                            : "entry"
                        : "setup",
                    )
                  }
                >
                  <Plus />
                  {section === "cotizaciones"
                    ? "Registrar cambio"
                    : section === "pagos"
                      ? "Agregar pago"
                      : "Anotar movimiento"}
                </Button>
              </div>
            )}
          </div>
          {section !== "resumen" && paymentNotice}
          {notice && (
            <p className="notice" role="status">
              <Check size={16} />
              {notice}
            </p>
          )}
          {error && !modal && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          {owned.length > 0 && (["movimientos", "pagos"] as Section[]).includes(section) && (
            <div className="workspace-toolbar">
              <Select
                label="Moneda de los importes"
                value={currency}
                onChange={(event) => updateParam("moneda", event.target.value)}
                options={currencyOptions(owned)}
              />
              {availableCurrencies(owned).length > 0 && (
                <Button variant="outline" size="sm" onClick={() => open("add-currency")}>
                  <Plus size={15} />
                  Agregar moneda
                </Button>
              )}
              <span className="toolbar-caption">Cada moneda, por separado.</span>
            </div>
          )}
          {snapshot.accounts.length === 0 &&
          (["resumen", "movimientos", "estadisticas", "pagos"] as Section[]).includes(section) ? (
            <div className="onboarding-panel">
              <span className="eyebrow">EL PRIMER PASO</span>
              <h2>Empecemos por donde estás hoy.</h2>
              <p>
                Podés cargar cuánto tenés en pesos y en dólares, o comenzar en cero. Después, sólo
                necesitás anotar lo que entra y lo que sale.
              </p>
              <Button onClick={() => open("setup")}>
                Configurar mis saldos <ArrowRight />
              </Button>
            </div>
          ) : (
            <>
              {section === "resumen" && (
                <Overview
                  paymentNotice={paymentNotice}
                  snapshot={snapshot}
                  base={base}
                  open={open}
                  view={balanceView(params.get("vista"))}
                  onView={(value) => updateParam("vista", value)}
                  cadence={params.get("edicion") === "semanal" ? "weekly" : "daily"}
                  onCadence={(value) =>
                    updateParam("edicion", value === "weekly" ? "semanal" : "diaria")
                  }
                  preview={preview}
                  dollar={
                    params.get("dolar") === "usd-mep"
                      ? "usd-mep"
                      : params.get("dolar") === "usd-blue"
                        ? "usd-blue"
                        : "usd-oficial"
                  }
                  onDollar={(value) => updateParam("dolar", value)}
                />
              )}
              {section === "movimientos" && (
                <Movements
                  snapshot={snapshot}
                  currency={currency}
                  query={params.get("q") || ""}
                  kind={params.get("tipo") || "all"}
                  updateParam={updateParam}
                  open={open}
                  preview={preview}
                />
              )}
              {section === "pagos" && (
                <Payments
                  snapshot={snapshot}
                  currency={currency}
                  filter={paymentFilter(params.get("estado"))}
                  month={selectedPaymentMonth(params.get("mes"), snapshot.asOf)}
                  base={base}
                  updateParam={updateParam}
                  open={open}
                />
              )}
              {section === "estadisticas" && statistics && (
                <Statistics data={statistics} currencies={owned} asOf={snapshot.asOf} base={base} />
              )}
            </>
          )}
          {section === "mercados" && (
            <Markets
              snapshot={snapshot}
              query={params.get("q") || ""}
              onlySaved={params.get("favoritos") === "si"}
              updateParam={updateParam}
              preview={preview}
            />
          )}
          {section === "cotizaciones" && <Quotes snapshot={snapshot} preview={preview} />}
          {section === "noticias" && <News snapshot={snapshot} preview={preview} />}
          <footer className="workspace-footer">
            <span>Flujario. Un poco más claro, todos los días.</span>
            <span>
              {section === "resumen"
                ? "Cada importe indica su moneda. Saldos sin conversiones implícitas."
                : section === "noticias"
                  ? "Titulares con origen y enlace. Tus diarios favoritos personalizan Resumen."
                  : section === "estadisticas"
                    ? "Importes por moneda, calculados a partir de los registros."
                    : `Importes en ${currency} · Cada cambio se registra por separado`}
            </span>
          </footer>
        </main>
      </div>
      <Dialog
        open={modal !== null}
        onOpenChange={(value) => {
          if (!value && !pending) setModal(null);
        }}
      >
        <DialogContent
          onInteractOutside={(event) => {
            if (pending) event.preventDefault();
          }}
        >
          <DialogTitle className="dialog-title">{modalCopy.title}</DialogTitle>
          <DialogDescription className="dialog-description">
            {modalCopy.description}
          </DialogDescription>
          <fetcher.Form
            method="post"
            action={`${base}/${section}`}
            onSubmit={submitPreview}
            className="finance-form"
            key={requestKey}
          >
            <input type="hidden" name="requestKey" value={requestKey} />
            {modal === "setup" && (
              <>
                <input type="hidden" name="intent" value="setup" />
                <Field
                  label="Saldo inicial en pesos (ARS)"
                  name="ars"
                  placeholder="0,00"
                  defaultValue="0"
                  inputMode="decimal"
                  required
                />
                <Field
                  label="Fecha del saldo inicial en ARS (inicio del día)"
                  name="arsOpeningDate"
                  type="date"
                  defaultValue={snapshot.asOf}
                  max={snapshot.asOf}
                  required
                />
                <Field
                  label="Saldo inicial en dólares (USD)"
                  name="usd"
                  placeholder="0,00"
                  defaultValue="0"
                  inputMode="decimal"
                  required
                />
                <Field
                  label="Fecha del saldo inicial en USD (inicio del día)"
                  name="usdOpeningDate"
                  type="date"
                  defaultValue={snapshot.asOf}
                  max={snapshot.asOf}
                  required
                />
                <p className="field-hint">
                  Los saldos iniciales corresponden al inicio del día elegido y no se cuentan como
                  ingresos. Los resúmenes anteriores se podrán guardar como históricos.
                </p>
              </>
            )}
            {modal === "entry" && (
              <EntryFields owned={owned} currency={currency} asOf={snapshot.asOf} />
            )}
            {modal === "payment" && (
              <NewPaymentFields currency={currency} owned={owned} asOf={snapshot.asOf} />
            )}
            {modal === "exchange" && (
              <ExchangeFields
                owned={owned}
                currency={currency}
                asOf={snapshot.asOf}
                quotes={snapshot.quotes}
                preview={preview}
              />
            )}
            {modal === "add-currency" && <AddCurrencyFields owned={owned} asOf={snapshot.asOf} />}
            {modal &&
              typeof modal === "object" &&
              (modal.kind === "edit-expense" ? (
                <EntryFields
                  owned={owned}
                  currency={currency}
                  asOf={snapshot.asOf}
                  expense={modal.expense}
                />
              ) : (
                <ExistingPaymentFields modal={modal} asOf={snapshot.asOf} />
              ))}
            {!(
              modal &&
              typeof modal === "object" &&
              modal.kind === "edit-expense" &&
              modal.expense.imported
            ) && (
              <p className="field-hint">
                Usá coma para decimales. CLP se registra en pesos enteros.
              </p>
            )}
            {error && (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}
            <div className="form-actions">
              <Button
                type="button"
                variant="outline"
                onClick={() => setModal(null)}
                disabled={pending}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={pending}>
                {pending
                  ? "Guardando…"
                  : modal === "setup"
                    ? "Guardar saldos"
                    : modal === "exchange"
                      ? "Registrar cambio"
                      : modal === "add-currency"
                        ? "Agregar moneda"
                        : modal && typeof modal === "object" && modal.kind === "pay"
                          ? "Confirmar pago"
                          : modal && typeof modal === "object" && modal.kind === "edit-expense"
                            ? "Guardar cambios"
                            : "Guardar"}
                <ArrowRight />
              </Button>
            </div>
          </fetcher.Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
