import { useEffect, useMemo, useRef, useState } from "react";
import { useRevalidator } from "react-router";
import { Upload, FileSearch, ChartNoAxesCombined, ShieldCheck, X } from "lucide-react";
import { Button } from "../ui/button";
import { Field, Select } from "./shared";
import { StatementCharts } from "./statement-charts";
import type { Snapshot } from "~/domain/finance";
import { categories } from "~/data/categories";
import { statementInstitutions, type StatementInstitution } from "~/data/statement-institutions";
import { formatMoney, sumMinor, type Currency } from "~/domain/money";
import { formatFullDate, isISODate, today } from "~/domain/dates";
import {
  guessMapping,
  mapStatementGrid,
  readStatementAmount,
  validateDraft,
  signedMoneyInput,
  type DraftRow,
  type Grid,
  type Mapping,
} from "~/domain/statement-reading";
import {
  emptyStatementState,
  statementAnalysis,
  duplicateStatementKeys,
  MAX_CONFIRM_ROWS,
  MAX_STATEMENT_ROWS,
  type StatementState,
  type StatementMutation,
  type StatementFormat,
  type StatementTarget,
  type AnalysisLine,
} from "~/domain/statements";
import "~/statements.css";

const endpoint = "/app/importaciones/datos";
const movementKinds = {
  expense: "Gasto",
  income: "Ingreso",
  internal: "Transferencia propia",
  part: "Detalle",
};
function reviewAmount(row: DraftRow) {
  try {
    const value = readStatementAmount(row.amount, row.currency, "ar");
    if (value <= 0) return "Importe para revisar";
    return formatMoney(row.kind === "expense" ? -value : value, row.currency);
  } catch {
    return "Importe para revisar";
  }
}

type SaveResult = { ok: boolean; error?: string; duplicateKeys?: string[]; ready?: boolean };
async function jsonRequest<T = SaveResult>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, { credentials: "same-origin", cache: "no-store", ...options });
  if (res.redirected || !res.headers.get("Content-Type")?.includes("application/json"))
    throw new Error(
      res.status === 413
        ? "Hay demasiadas filas. Acotá el período."
        : "No pudimos leer la respuesta. Verificá tu sesión y volvé a intentar.",
    );
  const result = (await res.json()) as T & { error?: string };
  if (!res.ok && !result.error)
    throw new Error("No pudimos consultar los movimientos. Volvé a intentar.");
  return result;
}
export default function StatementTools({
  snapshot,
  currency: workspaceCurrency,
  preview,
}: {
  snapshot: Snapshot;
  currency: Currency;
  preview: boolean;
}) {
  const [view, setView] = useState<"closed" | "import" | "analysis">("closed");
  const [state, setState] = useState<StatementState>(emptyStatementState);
  const [from, setFrom] = useState(`${snapshot.asOf.slice(0, 4)}-01-01`),
    [to, setTo] = useState(snapshot.asOf);
  const [loaded, setLoaded] = useState(""),
    [loadError, setLoadError] = useState("");
  const [refresh, setRefresh] = useState(0);
  const [mode, setMode] = useState<"bank" | "card">("bank");
  const [target, setTarget] = useState("");
  const [draftRows, setRows] = useState<DraftRow[]>([]),
    [grids, setGrids] = useState<Grid[]>([]),
    [sheet, setSheet] = useState(0),
    [mapping, setMapping] = useState<Mapping | null>(null);
  const [detectedCurrencies, setDetectedCurrencies] = useState<Currency[] | null>(null);
  const [reviewCurrency, setReviewCurrency] = useState<Currency | null>(null);
  const [format, setFormat] = useState<StatementFormat>("csv");
  const [institution, setInstitution] = useState<StatementInstitution>("nacion");
  const [message, setMessage] = useState(""),
    [error, setError] = useState("");
  const [reading, setReading] = useState(false),
    [saving, setSaving] = useState(false);
  const [reviewed, setReviewed] = useState(false),
    [page, setPage] = useState(0);
  const [serverDuplicates, setServerDuplicates] = useState<string[]>([]);
  const [password, setPassword] = useState(""),
    [ocr, setOcr] = useState(false),
    [encoding, setEncoding] = useState("UTF-8");
  const [opening, setOpening] = useState(""),
    [previewOpening, setPreviewOpening] = useState("");
  const [group, setGroup] = useState<"day" | "month" | "quarter" | "year">("month"),
    [charts, setCharts] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null),
    optionsRef = useRef<HTMLDetailsElement>(null),
    abortRef = useRef<AbortController | null>(null),
    requestRef = useRef(new Map<Currency, { fingerprint: string; key: string }>());
  const revalidator = useRevalidator();
  const asOf = preview ? today() : snapshot.asOf;
  const automatic = detectedCurrencies !== null;
  const currency = view === "import" && reviewCurrency ? reviewCurrency : workspaceCurrency;
  const rows = automatic ? draftRows.filter((row) => row.currency === currency) : draftRows;
  const account = snapshot.accounts.find((a) => a.currency === currency);
  const openingDate = preview ? previewOpening : account?.openingDate;
  const rangeKey = `${view}|${currency}|${from}|${to}|${refresh}`;
  const dataReady = preview || (loaded === rangeKey && !loadError);
  useEffect(() => {
    abortRef.current?.abort();
    setRows([]);
    setGrids([]);
    setMapping(null);
    setDetectedCurrencies(null);
    setReviewCurrency(null);
    setReviewed(false);
    setServerDuplicates([]);
    setPage(0);
    setTarget("");
    setError("");
    setMessage("");
    setPreviewOpening("");
    setOpening("");
    requestRef.current.clear();
  }, [workspaceCurrency]);
  useEffect(
    () => () => {
      abortRef.current?.abort();
    },
    [],
  );
  useEffect(() => {
    if (view === "closed" || preview || (view === "analysis" && (from > to || !from || !to)))
      return;
    const abort = new AbortController();
    setLoaded("");
    setLoadError("");
    // La revisión de duplicados debe incluir todo el historial accesible, no sólo el informe visible.
    const params = new URLSearchParams({
      moneda: currency,
      desde: view === "import" ? "1900-01-01" : from,
      hasta: view === "import" ? asOf : to,
    });
    jsonRequest<StatementState>(`${endpoint}?${params}`, { signal: abort.signal })
      .then((data) => {
        if (abort.signal.aborted) return;
        setState(data);
        setLoaded(rangeKey);
      })
      .catch((e) => {
        if (!abort.signal.aborted) setLoadError(e.message);
      });
    return () => abort.abort();
  }, [view, currency, from, to, refresh, preview, asOf]);
  const ledger = snapshot.entries.filter(
    (e): e is typeof e & { kind: "income" | "expense" } =>
      e.kind === "income" || e.kind === "expense",
  );
  const targets = [
    ...ledger
      .filter((e) => e.kind === "expense" && e.currency === currency)
      .map((e) => ({
        key: `entry:${e.id}`,
        target: { kind: "entry", id: e.id } as StatementTarget,
        date: e.date,
        description: e.description,
        amountMinor: e.amountMinor,
      })),
    ...state.history
      .filter((r) => r.kind === "expense" && r.currency === currency)
      .map((r) => ({
        key: `history:${r.id}`,
        target: { kind: "history", id: r.id } as StatementTarget,
        date: r.date,
        description: r.description,
        amountMinor: r.amountMinor,
      })),
  ].sort((a, b) => b.date.localeCompare(a.date));
  const parent = targets.find((t) => t.key === target);
  const results = rows.map((row) => validateDraft(row, mode === "card", asOf));
  const selected = rows.flatMap((row, i) =>
    row.selected && results[i]?.value ? [results[i]!.value!] : [],
  );
  const invalid = rows.filter((row, i) => row.selected && results[i]?.error).length;
  const duplicates = new Set([
    ...duplicateStatementKeys(selected, [...ledger, ...state.history]),
    ...serverDuplicates,
  ]);
  const unacknowledged = selected.filter(
    (r) => duplicates.has(r.key) && !r.duplicateAcknowledged,
  ).length;
  const selectedCount = rows.filter((r) => r.selected).length;
  const affecting = selected.filter((r) => openingDate && r.date >= openingDate);
  const cashIncome = sumMinor(
    affecting.filter((r) => r.kind === "income").map((r) => r.amountMinor),
  );
  const cashExpense = sumMinor(
    affecting.filter((r) => r.kind === "expense").map((r) => r.amountMinor),
  );
  const total = useMemo(() => {
    try {
      return sumMinor(selected.map((r) => r.amountMinor));
    } catch {
      return null;
    }
  }, [selected]);
  const analysis = useMemo(() => {
    try {
      return {
        value: statementAnalysis(
          ledger as AnalysisLine[],
          state.history,
          state.breakdowns,
          currency,
          from,
          to,
          group,
        ),
      };
    } catch {
      return { error: "Los totales superan el límite admitido. Acotá el período." };
    }
  }, [snapshot.entries, state, currency, from, to, group]);
  function edit(key: string, patch: Partial<DraftRow>) {
    setRows((old) =>
      old.map((r) =>
        r.key === key
          ? {
              ...r,
              ...patch,
              issue: undefined,
              duplicateAcknowledged:
                patch.duplicateAcknowledged ??
                (patch.date === undefined && patch.kind === undefined && patch.amount === undefined
                  ? r.duplicateAcknowledged
                  : false),
            }
          : r,
      ),
    );
    setReviewed(false);
    setError("");
  }
  function selectReviewCurrency(next: Currency) {
    setReviewCurrency(next);
    setReviewed(false);
    setServerDuplicates([]);
    setPage(0);
    setOpening("");
    setPreviewOpening("");
    setError("");
  }
  async function read(file = fileRef.current?.files?.[0], useOptions = true) {
    if (!file) {
      setError("Elegí un archivo primero.");
      return;
    }
    setReading(true);
    setError("");
    setMessage("Preparando lectura local…");
    setRows([]);
    setServerDuplicates([]);
    setGrids([]);
    setMapping(null);
    setDetectedCurrencies(null);
    setReviewCurrency(null);
    setReviewed(false);
    setPage(0);
    setOpening("");
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const { readStatementFile } = await import("~/services/statement-files.client");
      const result = await readStatementFile(file, {
        signal: controller.signal,
        progress: setMessage,
        password: useOptions ? password : undefined,
        ocr: useOptions && ocr,
        encoding: useOptions ? encoding : undefined,
        accountStatement: mode === "bank",
      });
      if (controller.signal.aborted) return;
      if (result.santander) {
        const currencies = result.santander.map((batch) => batch.currency);
        setDetectedCurrencies(currencies);
        setRows(result.santander.flatMap((batch) => batch.rows));
        setReviewCurrency(
          result.santander.find((batch) => batch.currency === workspaceCurrency)?.currency ??
            currencies[0] ??
            null,
        );
        if (optionsRef.current) optionsRef.current.open = false;
      } else {
        setGrids(result.grids);
        setSheet(0);
        setMapping(guessMapping(result.grids[0]!));
      }
      setFormat(result.format);
      setMessage(result.notice);
      setPassword("");
    } catch (e) {
      if (!controller.signal.aborted) {
        setError(e instanceof Error ? e.message : "No pudimos leer el archivo.");
        setMessage("");
        if (optionsRef.current && e instanceof Error && e.message.includes("PDF protegido"))
          optionsRef.current.open = true;
      } else if (abortRef.current === controller) setMessage("Lectura cancelada.");
    } finally {
      if (abortRef.current === controller) {
        setReading(false);
        abortRef.current = null;
      }
    }
  }
  function mapRows() {
    try {
      if (!mapping) return;
      const next = mapStatementGrid(grids[sheet]!, mapping, currency, mode === "card");
      if (next.length > MAX_STATEMENT_ROWS)
        throw new Error("Hay más de 2.000 filas: exportá un período más corto.");
      setRows(next);
      setPage(0);
      setReviewed(false);
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function mutate(mutation: StatementMutation) {
    setSaving(true);
    setError("");
    try {
      const result = await jsonRequest(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(mutation),
      });
      if (!result.ok) {
        if (result.duplicateKeys?.length) {
          setServerDuplicates(result.duplicateKeys);
          setRows((old) =>
            old.map((r) =>
              result.duplicateKeys!.includes(r.key)
                ? {
                    ...r,
                    duplicateAcknowledged: false,
                  }
                : r,
            ),
          );
          setReviewed(false);
          setRefresh((n) => n + 1);
          revalidator.revalidate();
        }
        throw new Error(result.error);
      }
      if (mutation.intent === "opening-date")
        setMessage("Fecha guardada. El saldo inicial y los movimientos anteriores se conservaron.");
      else {
        const confirmed = new Set(mutation.rows.map((r) => r.key));
        setRows((old) => old.filter((r) => !confirmed.has(r.key)));
        setReviewed(false);
        setServerDuplicates([]);
        setPage(0);
        setMessage(
          mutation.intent === "breakdown"
            ? result.ready
              ? "Desglose conciliado. No se creó otro egreso."
              : "Desglose guardado pendiente: revisá la diferencia antes de aplicarlo al análisis."
            : "Lote confirmado. Los históricos se conservaron sin modificar tu saldo.",
        );
        requestRef.current.delete(mutation.currency);
      }
      setRefresh((n) => n + 1);
      revalidator.revalidate();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }
  function confirm() {
    const base = {
      institution: automatic ? ("santander" as const) : institution,
      format,
      currency,
      reviewed: true as const,
      rows: selected,
    };
    const payload =
      mode === "card" && parent
        ? { intent: "breakdown" as const, ...base, target: parent.target }
        : { intent: "import" as const, ...base };
    const fingerprint = JSON.stringify(payload);
    const previous = requestRef.current.get(currency);
    const requestKey = previous?.fingerprint === fingerprint ? previous.key : crypto.randomUUID();
    requestRef.current.set(currency, { fingerprint, key: requestKey });
    void mutate({ ...payload, requestKey });
  }
  function restoreBreakdown(key: string) {
    const p = targets.find((t) => t.key === key),
      b = state.breakdowns.find(
        (b) => p && b.target.id === p.target.id && b.target.kind === p.target.kind,
      );
    if (!b) return;
    setMode("card");
    setDetectedCurrencies(null);
    setReviewCurrency(null);
    setTarget(key);
    setRows(
      b.parts.map((r, i) => ({
        ...r,
        key: `p${i + 1}`,
        amount: signedMoneyInput(r.amountMinor, r.currency),
        selected: true,
      })),
    );
    setGrids([]);
    setMapping(null);
    setPage(0);
    setReviewed(false);
    setView("import");
    setError("");
  }
  const busy = reading || saving;
  return (
    <section className="statement-tools" aria-label="Importación y análisis de resúmenes">
      <div className="statement-launch">
        <div>
          <span className="statement-eyebrow">TUS RESÚMENES, MÁS CLAROS</span>
          <h2>Del archivo a tus movimientos.</h2>
          <p>Leé, revisá y recién después confirmá.</p>
        </div>
        <div className="statement-actions">
          <Button variant="outline" onClick={() => setView("analysis")} disabled={busy}>
            <ChartNoAxesCombined />
            Ver análisis
          </Button>
          <Button onClick={() => setView("import")} disabled={busy}>
            <Upload />
            Importar resumen
          </Button>
        </div>
      </div>
      {view !== "closed" && (
        <div className="statement-workbench">
          <div className="statement-heading">
            <div>
              <span className="statement-eyebrow">
                {currency} · {preview ? "VISTA PREVIA, SIN GUARDADO" : "ESPACIO PRIVADO"}
              </span>
              <h3>{view === "import" ? "Importar con revisión" : "Análisis por período"}</h3>
            </div>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Cerrar importación y análisis"
              disabled={busy}
              onClick={() => setView("closed")}
            >
              <X />
            </Button>
          </div>
          {preview && (
            <p className="statement-note">
              Los movimientos del panel son ficticios. Podés leer y revisar un archivo local; para
              confirmarlo necesitás iniciar sesión en tu cuenta.
            </p>
          )}
          {loadError && (
            <p className="form-error" role="alert">
              {loadError}{" "}
              <button className="text-link" onClick={() => setRefresh((n) => n + 1)}>
                Reintentar
              </button>
            </p>
          )}
          {!dataReady && !loadError && <p role="status">Consultando historial y desgloses…</p>}
          {view === "import" ? (
            <>
              <p className="statement-privacy">
                <ShieldCheck size={17} />
                El archivo y su contraseña quedan en este navegador. Sólo se envían las filas que
                confirmes.
              </p>
              <fieldset disabled={busy} className="statement-fieldset">
                <div className="statement-file">
                  <label className="field">
                    <span>Elegí tu resumen · PDF, CSV o Excel · hasta 10 MB</span>
                    <input
                      ref={fileRef}
                      type="file"
                      accept=".pdf,.csv,.xlsx,.xls"
                      onChange={(e) => {
                        const file = e.currentTarget.files?.[0];
                        if (file) void read(file, false);
                      }}
                    />
                  </label>
                  <details ref={optionsRef}>
                    <summary>Opciones de lectura</summary>
                    <div className="statement-options">
                      <Select
                        label="Qué querés leer"
                        value={mode}
                        onChange={(e) => {
                          setMode(e.target.value as typeof mode);
                          setRows([]);
                          setGrids([]);
                          setMapping(null);
                          setDetectedCurrencies(null);
                          setReviewCurrency(null);
                          setReviewed(false);
                          setMessage("");
                          setError("");
                        }}
                        options={[
                          ["bank", "Resumen de cuenta"],
                          ["card", "Detalle de tarjeta: desglosar un pago"],
                        ]}
                      />
                      <Select
                        label="Banco o billetera de origen"
                        value={automatic ? "santander" : institution}
                        disabled={automatic}
                        onChange={(e) => setInstitution(e.target.value as StatementInstitution)}
                        options={statementInstitutions.map((s) => [s.id, s.name])}
                      />
                      <Field
                        label="Contraseña del PDF (si tiene)"
                        name="pdf-local-password"
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        autoComplete="off"
                      />
                      <Select
                        label="Codificación del CSV"
                        value={encoding}
                        onChange={(e) => setEncoding(e.target.value)}
                        options={[
                          ["UTF-8", "UTF-8"],
                          ["windows-1252", "Windows / ANSI"],
                        ]}
                      />
                    </div>
                    <label className="statement-check">
                      <input
                        type="checkbox"
                        checked={ocr}
                        onChange={(e) => setOcr(e.target.checked)}
                      />
                      Usar OCR para PDF escaneado (más lento, hasta 30 páginas)
                    </label>
                    <Button variant="outline" onClick={() => void read()}>
                      <FileSearch />
                      Leer con estas opciones
                    </Button>
                  </details>
                </div>
                {mode === "card" && (
                  <>
                    <Select
                      label="Pago ya registrado que querés desglosar"
                      value={target}
                      onChange={(e) => {
                        setTarget(e.target.value);
                        setReviewed(false);
                      }}
                      options={[
                        ["", "Elegí un egreso"],
                        ...targets.map((p) => [
                          p.key,
                          `${p.date} · ${p.description} · ${formatMoney(p.amountMinor, currency)}`,
                        ]),
                      ]}
                    />
                    <p className="field-hint">
                      No se cargan nuevos gastos. El detalle se usa para clasificar ese único pago,
                      sólo cuando el total coincide.
                    </p>
                  </>
                )}
              </fieldset>
              {reading && (
                <Button variant="outline" onClick={() => abortRef.current?.abort()}>
                  Cancelar lectura
                </Button>
              )}
              {!!detectedCurrencies?.length && (
                <div
                  className="statement-currencies"
                  role="group"
                  aria-label="Monedas del resumen de Santander"
                >
                  {detectedCurrencies.map((code) => {
                    const remaining = draftRows.filter((row) => row.currency === code).length;
                    return (
                      <Button
                        key={code}
                        size="sm"
                        variant={code === currency ? "default" : "outline"}
                        aria-pressed={code === currency}
                        disabled={busy}
                        onClick={() => selectReviewCurrency(code)}
                      >
                        {code === "ARS" ? "Pesos" : "Dólares"} · {remaining || "Revisado"}
                      </Button>
                    );
                  })}
                </div>
              )}
              {mapping && grids[sheet] && (
                <fieldset disabled={busy} className="statement-fieldset statement-mapping">
                  <h4>1. Elegí dónde empieza la tabla y qué representa cada columna.</h4>
                  <div className="statement-options">
                    <Select
                      label="Hoja"
                      value={String(sheet)}
                      onChange={(e) => {
                        const i = Number(e.target.value);
                        setSheet(i);
                        setMapping(guessMapping(grids[i]!));
                        setRows([]);
                      }}
                      options={grids.map((g, i) => [String(i), g.name])}
                    />
                    <Field
                      label="Fila de encabezados (1 es la primera)"
                      name="header-row"
                      type="number"
                      min={1}
                      max={grids[sheet]!.rows.length}
                      value={mapping.header + 1}
                      onChange={(e) => {
                        const n = Math.max(
                          0,
                          Math.min(grids[sheet]!.rows.length - 1, Number(e.target.value) - 1),
                        );
                        setMapping({ ...mapping, header: n });
                      }}
                    />
                  </div>
                  <div className="statement-mapping-grid">
                    {(
                      [
                        ["date", "Fecha"],
                        ["description", "Descripción"],
                        ["amount", "Importe único"],
                        ["debit", "Débito / egreso"],
                        ["credit", "Crédito / ingreso"],
                        ["currency", "Moneda (opcional)"],
                        ["type", "Tipo (opcional)"],
                      ] as const
                    ).map(([key, label]) => (
                      <Select
                        key={key}
                        label={label}
                        value={String(mapping[key])}
                        onChange={(e) => setMapping({ ...mapping, [key]: Number(e.target.value) })}
                        options={[
                          ["-1", "Sin asignar"],
                          ...Array.from(
                            {
                              length: Math.max(
                                ...grids[sheet]!.rows.slice(mapping.header, mapping.header + 8).map(
                                  (r) => r.length,
                                ),
                              ),
                            },
                            (_, i) => [
                              String(i),
                              `${i + 1} · ${grids[sheet]!.rows[mapping.header]?.[i] || "Sin título"}`,
                            ],
                          ),
                        ]}
                      />
                    ))}
                    <Select
                      label="Separadores del archivo"
                      value={mapping.locale}
                      onChange={(e) =>
                        setMapping({ ...mapping, locale: e.target.value as Mapping["locale"] })
                      }
                      options={[
                        ["ar", "1.234,56 (coma decimal)"],
                        ["en", "1,234.56 (punto decimal)"],
                      ]}
                    />
                    {mode === "bank" && (
                      <Select
                        label="Sentido del importe único"
                        value={mapping.convention}
                        onChange={(e) =>
                          setMapping({
                            ...mapping,
                            convention: e.target.value as Mapping["convention"],
                          })
                        }
                        options={[
                          ["signed", "Negativo: gasto / positivo: ingreso"],
                          ["expense", "Todos son gastos"],
                          ["income", "Todos son ingresos"],
                        ]}
                      />
                    )}
                  </div>
                  <details>
                    <summary>Ver filas originales para ubicar las columnas</summary>
                    <div className="statement-raw">
                      <table>
                        <tbody>
                          {grids[sheet]!.rows.slice(0, 60).map((r, i) => (
                            <tr key={i}>
                              <th>{i + 1}</th>
                              {r.map((c, j) => (
                                <td key={j}>{c}</td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <p className="field-hint">
                      Vista de las primeras 60 filas. Las demás también pasan a revisión.
                    </p>
                  </details>
                  <Button variant="outline" onClick={mapRows}>
                    Preparar filas para revisar
                  </Button>
                </fieldset>
              )}
              {!!rows.length && (
                <div className="statement-review">
                  <h4>{automatic ? "Revisá las categorías" : "2. Revisá cada movimiento."}</h4>
                  <p>
                    {automatic
                      ? "Revisá las categorías antes de importar. Podés cambiar «Otros» o marcar un movimiento como transferencia propia."
                      : "Corregí o excluí las filas con errores. Una transferencia entre cuentas propias en la misma moneda no es ingreso ni gasto."}
                  </p>
                  {(!automatic || rows.length > MAX_CONFIRM_ROWS) && (
                    <div className="statement-actions">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busy}
                        onClick={() => {
                          const keys = new Set(
                            rows.slice(0, MAX_CONFIRM_ROWS).map((row) => row.key),
                          );
                          setRows((old) =>
                            old.map((row) =>
                              row.currency === currency
                                ? { ...row, selected: keys.has(row.key) }
                                : row,
                            ),
                          );
                          setReviewed(false);
                        }}
                      >
                        Seleccionar primeras 500
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busy}
                        onClick={() => {
                          setRows((old) =>
                            old.map((row) =>
                              row.currency === currency ? { ...row, selected: false } : row,
                            ),
                          );
                          setReviewed(false);
                        }}
                      >
                        Excluir todas
                      </Button>
                    </div>
                  )}
                  <fieldset disabled={busy} className="statement-fieldset">
                    <div className="statement-rows">
                      {rows.slice(page * 20, page * 20 + 20).map((row, j) => {
                        const i = page * 20 + j;
                        const duplicate = duplicates.has(row.key);
                        const categoryField = (
                          <Select
                            label="Categoría"
                            value={row.category}
                            onChange={(e) =>
                              edit(row.key, { category: e.target.value as DraftRow["category"] })
                            }
                            options={categories.map((c) => [c, c])}
                          />
                        );
                        const inclusion = (
                          <label className="statement-check">
                            <input
                              type="checkbox"
                              checked={row.selected}
                              onChange={(e) => edit(row.key, { selected: e.target.checked })}
                            />
                            {automatic ? "Incluir este movimiento" : row.sourceRef}
                          </label>
                        );
                        const MovementDetails = automatic ? "details" : "div";
                        return (
                          <div
                            className={`statement-row ${!row.selected ? "is-excluded" : ""}`}
                            key={row.key}
                          >
                            {automatic ? (
                              <div className="statement-category-row">
                                <div>
                                  <strong>{row.description}</strong>
                                  <p>
                                    {isISODate(row.date)
                                      ? formatFullDate(row.date)
                                      : "Fecha para revisar"}{" "}
                                    · {movementKinds[row.kind]}
                                    {!row.selected
                                      ? " · Excluido"
                                      : openingDate && row.date < openingDate
                                        ? " · Histórico"
                                        : ""}
                                  </p>
                                </div>
                                <strong className="statement-review-amount" data-kind={row.kind}>
                                  {reviewAmount(row)}
                                </strong>
                                {categoryField}
                              </div>
                            ) : (
                              <div className="statement-row-top">
                                {inclusion}
                                <span>
                                  {mode === "card"
                                    ? "Detalle sin nuevo egreso"
                                    : openingDate && row.date < openingDate
                                      ? "Histórico · no altera saldo"
                                      : row.kind === "internal"
                                        ? "Transferencia propia · no altera saldo"
                                        : openingDate
                                          ? "Afecta tu saldo"
                                          : "Saldo pendiente de fecha inicial"}
                                </span>
                              </div>
                            )}
                            <MovementDetails>
                              {automatic && (
                                <>
                                  <summary>Corregir movimiento</summary>
                                  {inclusion}
                                </>
                              )}
                              <div className="statement-row-fields">
                                <Field
                                  label="Fecha"
                                  name={`${row.key}-date`}
                                  type="date"
                                  value={row.date}
                                  max={asOf}
                                  onChange={(e) => edit(row.key, { date: e.target.value })}
                                />
                                <Field
                                  label="Descripción"
                                  name={`${row.key}-desc`}
                                  value={row.description}
                                  maxLength={120}
                                  onChange={(e) => edit(row.key, { description: e.target.value })}
                                />
                                <Field
                                  label={`Importe · ${currency}`}
                                  name={`${row.key}-amount`}
                                  inputMode="decimal"
                                  value={row.amount}
                                  onChange={(e) => edit(row.key, { amount: e.target.value })}
                                />
                                {mode === "bank" && (
                                  <Select
                                    label="Sentido"
                                    value={row.kind}
                                    onChange={(e) =>
                                      edit(row.key, { kind: e.target.value as DraftRow["kind"] })
                                    }
                                    options={[
                                      ["expense", movementKinds.expense],
                                      ["income", movementKinds.income],
                                      ["internal", movementKinds.internal],
                                    ]}
                                  />
                                )}
                                {!automatic && categoryField}
                              </div>
                            </MovementDetails>
                            {row.selected && results[i]?.error && (
                              <p className="form-error">{results[i]?.error}</p>
                            )}
                            {row.selected && duplicate && (
                              <label className="statement-check statement-warning">
                                <input
                                  type="checkbox"
                                  checked={row.duplicateAcknowledged}
                                  onChange={(e) =>
                                    edit(row.key, { duplicateAcknowledged: e.target.checked })
                                  }
                                />
                                Hay otro movimiento del mismo día, moneda, importe y sentido. Revisé
                                la coincidencia y quiero conservar ambos.
                              </label>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </fieldset>
                  <div className="statement-pagination">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={page === 0 || busy}
                      onClick={() => setPage((n) => n - 1)}
                    >
                      Anterior
                    </Button>
                    <span>
                      {page * 20 + 1}–{Math.min(rows.length, (page + 1) * 20)} de {rows.length}
                    </span>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={(page + 1) * 20 >= rows.length || busy}
                      onClick={() => setPage((n) => n + 1)}
                    >
                      Siguiente
                    </Button>
                  </div>
                  <div className="statement-confirm">
                    <p>
                      <strong>{selectedCount} filas seleccionadas</strong>
                      {invalid > 0 ? ` · ${invalid} para corregir` : ""}
                      {mode === "bank" ? ` · ${unacknowledged} coincidencias sin revisar` : ""}
                    </p>
                    {mode === "bank" ? (
                      <p>
                        {rows.filter((r) => r.selected && r.kind === "income").length} ingresos ·{" "}
                        {rows.filter((r) => r.selected && r.kind === "expense").length} gastos ·{" "}
                        {
                          rows.filter(
                            (r) =>
                              r.selected &&
                              openingDate &&
                              r.date < openingDate &&
                              r.kind !== "internal",
                          ).length
                        }{" "}
                        históricos ·{" "}
                        {rows.filter((r) => r.selected && r.kind === "internal").length}{" "}
                        transferencias propias.
                      </p>
                    ) : (
                      <p>
                        Detalle: {total === null ? "Fuera de límite" : formatMoney(total, currency)}{" "}
                        · Pago:{" "}
                        {parent ? formatMoney(parent.amountMinor, currency) : "Sin seleccionar"}
                        {parent && total !== null && total !== parent.amountMinor && (
                          <span className="statement-warning">
                            {" "}
                            · Diferencia:{" "}
                            {formatMoney(sumMinor([parent.amountMinor, -total]), currency)}. Se
                            guardará pendiente y no cambiará las categorías del análisis.
                          </span>
                        )}
                      </p>
                    )}
                    {mode === "bank" && openingDate && !invalid && (
                      <p>
                        Desde {openingDate}: ingresos {formatMoney(cashIncome, currency)} · egresos{" "}
                        {formatMoney(cashExpense, currency)}. Efecto en el saldo:{" "}
                        <strong>
                          {formatMoney(sumMinor([cashIncome, -cashExpense]), currency)} {currency}
                        </strong>
                        . Los históricos y las transferencias propias no cambian el saldo.
                      </p>
                    )}
                    {selectedCount > MAX_CONFIRM_ROWS && (
                      <p className="form-error">
                        Confirmá hasta 500 filas por lote; las restantes quedan en revisión.
                      </p>
                    )}
                    {mode === "bank" && (!automatic || (!preview && !openingDate)) && (
                      <details className="statement-cutoff" open={!openingDate}>
                        <summary>Fecha del saldo inicial · {currency}</summary>
                        <p>
                          Elegí el día al que corresponde tu saldo inicial en Flujario. Los
                          movimientos anteriores quedan en el historial y los de ese día en adelante
                          pueden cambiar tu saldo.
                        </p>
                        <div className="statement-options">
                          <Field
                            label={`Fecha del saldo inicial · ${currency}`}
                            name="statement-opening"
                            type="date"
                            value={opening || openingDate || ""}
                            max={asOf}
                            disabled={busy}
                            onChange={(e) => setOpening(e.target.value)}
                          />
                          <Button
                            variant="outline"
                            disabled={!opening || busy}
                            onClick={() =>
                              preview
                                ? setPreviewOpening(opening)
                                : void mutate({ intent: "opening-date", currency, date: opening })
                            }
                          >
                            Guardar fecha
                          </Button>
                        </div>
                      </details>
                    )}
                    {!automatic && (
                      <label className="statement-check">
                        <input
                          type="checkbox"
                          checked={reviewed}
                          disabled={busy}
                          onChange={(e) => setReviewed(e.target.checked)}
                        />
                        Revisé fechas, moneda, importes, categorías y las filas excluidas.
                      </label>
                    )}
                    <Button
                      disabled={
                        preview ||
                        busy ||
                        !dataReady ||
                        (!automatic && !reviewed) ||
                        !selected.length ||
                        !!invalid ||
                        total === null ||
                        selectedCount > MAX_CONFIRM_ROWS ||
                        (mode === "bank" ? !openingDate || unacknowledged > 0 : !parent)
                      }
                      onClick={confirm}
                    >
                      {saving
                        ? "Guardando…"
                        : mode === "card"
                          ? "Guardar desglose del pago"
                          : automatic
                            ? `Confirmar categorías e importar ${currency}`
                            : "Confirmar movimientos"}
                    </Button>
                  </div>
                </div>
              )}
            </>
          ) : (
            <>
              <div className="statement-options">
                <Field
                  label="Desde"
                  name="analysis-from"
                  type="date"
                  value={from}
                  max={to}
                  onChange={(e) => setFrom(e.target.value)}
                />
                <Field
                  label="Hasta"
                  name="analysis-to"
                  type="date"
                  value={to}
                  min={from}
                  max={asOf}
                  onChange={(e) => setTo(e.target.value)}
                />
                <Select
                  label="Agrupar por"
                  value={group}
                  onChange={(e) => setGroup(e.target.value as typeof group)}
                  options={[
                    ["day", "Día"],
                    ["month", "Mes"],
                    ["quarter", "Trimestre"],
                    ["year", "Año"],
                  ]}
                />
              </div>
              <p className="field-hint">
                Ingresos y egresos registrados, incluidos los históricos, por fecha del movimiento.
                El resultado del período no es tu saldo total. Un archivo puede cubrir sólo una
                parte de tus movimientos.
              </p>
              {dataReady && from <= to && analysis.value && (
                <>
                  <div className="statement-totals">
                    <div className="statement-income">
                      <span>Ingresos</span>
                      <strong>{formatMoney(analysis.value.income, currency)}</strong>
                    </div>
                    <div className="statement-expense">
                      <span>Egresos</span>
                      <strong>{formatMoney(analysis.value.expense, currency)}</strong>
                    </div>
                    <div>
                      <span>Resultado del período · {currency}</span>
                      <strong>{formatMoney(analysis.value.net, currency)}</strong>
                    </div>
                  </div>
                  <p className="field-hint">
                    {analysis.value.count} movimientos · Transferencias propias y cambios de moneda
                    excluidos del resultado.
                  </p>
                  <Button variant="outline" onClick={() => setCharts((v) => !v)}>
                    {charts ? "Ocultar gráficos" : "Crear gráficos"}
                  </Button>
                  {charts && <StatementCharts data={analysis.value} currency={currency} />}
                </>
              )}
              {analysis.error && (
                <p className="form-error" role="alert">
                  {analysis.error}
                </p>
              )}
              <h4>Desgloses de tarjeta</h4>
              {state.breakdowns.length ? (
                state.breakdowns.map((b) => {
                  const key = `${b.target.kind}:${b.target.id}`;
                  return (
                    <div className="statement-breakdown" key={key}>
                      <span>
                        {targets.find((p) => p.key === key)?.description} ·{" "}
                        {b.ready ? "Conciliado" : "Pendiente de revisar"} ·{" "}
                        {formatMoney(b.totalMinor, currency)} /{" "}
                        {formatMoney(b.parentMinor, currency)}
                      </span>
                      <Button variant="outline" size="sm" onClick={() => restoreBreakdown(key)}>
                        Revisar detalle
                      </Button>
                    </div>
                  );
                })
              ) : (
                <p className="field-hint">
                  Podés evaluar el resumen de una tarjeta desde Importar, eligiendo un pago
                  existente.
                </p>
              )}
              <h4>Históricos del período</h4>
              <p className="field-hint">
                Se incluyen en el análisis sin descontarse nuevamente del saldo.
              </p>
              {state.history.length ? (
                <div className="statement-history">
                  {state.history.map((r) => (
                    <div key={r.id}>
                      <span>
                        {r.date} · {r.description} · {r.category}
                      </span>
                      <strong>
                        {r.kind === "income" ? "+" : "−"}
                        {formatMoney(r.amountMinor, currency)}
                      </strong>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="field-hint">Sin históricos importados para estas fechas.</p>
              )}
            </>
          )}
          {message && (
            <p className="statement-note" role="status">
              {message}
            </p>
          )}
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          {!!state.batches.length && (
            <details className="statement-batches">
              <summary>Últimos lotes confirmados</summary>
              {state.batches.map((b) => (
                <p key={b.id}>
                  {statementInstitutions.find((s) => s.id === b.institution)?.name ?? b.institution}{" "}
                  · {b.mode === "card" ? "Detalle de tarjeta" : "Cuenta"} · {b.count} filas ·{" "}
                  {b.currency} · {new Date(b.createdAt).toLocaleDateString("es-AR")}
                </p>
              ))}
            </details>
          )}
        </div>
      )}
    </section>
  );
}
