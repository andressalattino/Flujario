import { Minus, X, ArrowUp, ChevronRight, LoaderCircle, Maximize2, Minimize2 } from "lucide-react";
import { Button } from "../ui/button";
import { suggestedQuestions, assistantLimitMessage, type AssistantUsage } from "~/domain/assistant";
import type { Currency } from "~/domain/currencies";
import { useId } from "react";
import type { RefObject, FormEvent, KeyboardEvent } from "react";

export function FlujarioAvatar({ small = false }: { small?: boolean }) {
  return (
    <img
      className={`flujario-avatar ${small ? "is-small" : ""}`}
      src="/images/flujario-avatar.webp"
      alt=""
      width={small ? 36 : 90}
      height={small ? 36 : 90}
      draggable={false}
    />
  );
}
export function ChatHeader({
  onClose,
  expanded,
  onToggleExpanded,
  titleId,
  descriptionId,
}: {
  onClose: () => void;
  expanded: boolean;
  onToggleExpanded: () => void;
  titleId: string;
  descriptionId: string;
}) {
  return (
    <header className="chat-header">
      <FlujarioAvatar small />
      <div>
        <h2 id={titleId}>Flujario AI</h2>
        <p id={descriptionId}>Asistente de análisis financiero</p>
      </div>
      <div className="chat-header-controls">
        <Button
          variant="ghost"
          size="sm"
          className="chat-size-toggle"
          aria-label={expanded ? "Reducir chat" : "Ampliar chat"}
          aria-pressed={expanded}
          onClick={onToggleExpanded}
        >
          {expanded ? <Minimize2 /> : <Maximize2 />}
          <span>{expanded ? "Reducir" : "Ampliar"}</span>
        </Button>
        <Button variant="ghost" size="icon" aria-label="Minimizar Flujario AI" onClick={onClose}>
          <Minus />
        </Button>
        <Button variant="ghost" size="icon" aria-label="Cerrar Flujario AI" onClick={onClose}>
          <X />
        </Button>
      </div>
    </header>
  );
}
export function SuggestedQuestions({
  onSelect,
  disabled,
  expanded,
}: {
  onSelect: (id: (typeof suggestedQuestions)[number]["id"]) => void;
  disabled: boolean;
  expanded: boolean;
}) {
  return (
    <details className="chat-suggestions" open={expanded}>
      <summary>Consultas estadísticas gratuitas</summary>
      <p>No usan tu cupo de IA.</p>
      <ul>
        {suggestedQuestions.map((q) => (
          <li key={q.id}>
            <button type="button" disabled={disabled} onClick={() => onSelect(q.id)}>
              <span>{q.question}</span>
              <ChevronRight size={15} />
            </button>
          </li>
        ))}
      </ul>
    </details>
  );
}
export function AssistantHelp({
  disabled,
  onSelect,
}: {
  disabled: boolean;
  onSelect: (id: (typeof suggestedQuestions)[number]["id"]) => void;
}) {
  return (
    <div className="chat-report">
      <h3>¿Qué me podés preguntar?</h3>
      <p>
        Estas cinco consultas funcionan sin IA. Podés escribirlas o elegir una para ver el informe
        en la moneda seleccionada.
      </p>
      <SuggestedQuestions disabled={disabled} expanded onSelect={onSelect} />
      <p>
        Con la IA habilitada también podés pedir análisis de tus ingresos, gastos, categorías,
        saldos y vencimientos para otros períodos. Si todavía no está conectada o no hay cupo, las
        cinco consultas de arriba siguen disponibles.
      </p>
      <p>
        Analizo los registros que cargaste en Flujario. No modifico tus datos ni doy consejos de
        inversión.
      </p>
    </div>
  );
}
const renewal = (value: string) =>
  new Intl.DateTimeFormat("es-AR", {
    timeZone: "America/Argentina/Buenos_Aires",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(value));
export function ChatUsageCounter({
  usage,
  preview,
}: {
  usage: AssistantUsage | null;
  preview: boolean;
}) {
  if (preview)
    return <div className="chat-usage">Vista previa · datos ficticios · sin llamadas a IA.</div>;
  if (!usage)
    return (
      <div className="chat-usage" role="status">
        Consultando el cupo de IA… Las estadísticas están disponibles.
      </div>
    );
  return (
    <div className="chat-usage">
      <div>
        <strong>
          {usage.reason === "unconfigured"
            ? "Preguntas libres con IA deshabilitadas"
            : usage.available
              ? `${usage.remaining} preguntas con IA disponibles`
              : "Sin cupo disponible para preguntas con IA"}
        </strong>
        {usage.reason !== "unconfigured" && (
          <span>
            {usage.used} / {usage.limit} usadas
          </span>
        )}
      </div>
      {usage.reason !== "unconfigured" && <p>Renovación: {renewal(usage.resetsAt)} · Argentina.</p>}
      {usage.reason === "user-limit" && <p role="status">{assistantLimitMessage}</p>}
      {usage.reason === "global-limit" && (
        <p role="status">
          El cupo general de IA está agotado temporalmente. Se renueva el{" "}
          {renewal(usage.globalResetsAt)}. Podés seguir usando las estadísticas.
        </p>
      )}
      {usage.reason === "unconfigured" && (
        <p>
          La IA todavía no está habilitada en este entorno. Podés escribir las consultas
          estadísticas sugeridas o elegirlas arriba.
        </p>
      )}
    </div>
  );
}
export function ChatInput({
  draft,
  setDraft,
  currency,
  setCurrency,
  currencies,
  busy,
  onSubmit,
  inputRef,
}: {
  draft: string;
  setDraft: (s: string) => void;
  currency: Currency;
  setCurrency: (c: Currency) => void;
  currencies: Currency[];
  busy: boolean;
  onSubmit: (e?: FormEvent) => void;
  inputRef: RefObject<HTMLTextAreaElement | null>;
}) {
  const noteId = useId();
  const key = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      if (!busy && draft.trim().length >= 3) onSubmit();
    }
  };
  return (
    <form className="chat-input" onSubmit={onSubmit}>
      <label className="chat-currency">
        <span>Analizar en</span>
        <select
          aria-label="Moneda del análisis"
          value={currency}
          onChange={(e) => setCurrency(e.target.value as Currency)}
          disabled={busy}
        >
          {currencies.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </label>
      <div className="chat-compose">
        <textarea
          ref={inputRef}
          aria-label="Tu pregunta para Flujario AI"
          placeholder="Escribí tu pregunta sobre tus registros…"
          value={draft}
          maxLength={800}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={key}
          rows={2}
          aria-describedby={noteId}
        />
        <Button
          type="submit"
          size="icon"
          aria-label="Enviar pregunta"
          disabled={busy || draft.trim().length < 3}
        >
          {busy ? <LoaderCircle className="chat-spin" /> : <ArrowUp />}
        </Button>
      </div>
      <p className="chat-input-note" id={noteId}>
        Analiza tus registros. No brinda asesoramiento financiero.
      </p>
    </form>
  );
}
