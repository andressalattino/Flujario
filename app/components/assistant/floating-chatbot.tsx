import { useEffect, useId, useRef, useState, type CSSProperties, type FormEvent } from "react";
import { ChevronRight, LoaderCircle, MessageCircle } from "lucide-react";
import { Button } from "../ui/button";
import {
  FlujarioAvatar,
  ChatHeader,
  ChatInput,
  ChatUsageCounter,
  SuggestedQuestions,
  AssistantHelp,
} from "./chat-parts";
import { FinancialReportView } from "./financial-chart";
import {
  presetPlan,
  matchStatisticQuestion,
  isAssistantHelpQuestion,
  shouldKeepAssistantRequest,
  suggestedQuestions,
  type AssistantAnswer,
  type AssistantRequest,
  type AssistantUsage,
} from "~/domain/assistant";
import { createFinancialReport } from "~/domain/assistant-analysis";
import { emptyStatementState } from "~/domain/statements";
import type { Snapshot } from "~/domain/finance";
import type { Currency } from "~/domain/currencies";
import "~/assistant.css";

const endpoint = "/app/asistente/datos";
const previewQuestionMessage =
  "Esta vista usa datos ficticios y no llama a la IA. Para probarla, escribí una de las consultas sugeridas o elegila arriba. Las preguntas libres requieren iniciar sesión y tener la IA habilitada.";
type Message =
  | { id: string; role: "user"; text: string }
  | { id: string; role: "help" }
  | { id: string; role: "assistant"; answer: AssistantAnswer };
async function requestAssistant(input?: AssistantRequest, signal?: AbortSignal) {
  const response = await fetch(endpoint, {
    method: input ? "POST" : "GET",
    credentials: "same-origin",
    cache: "no-store",
    headers: input ? { "Content-Type": "application/json" } : undefined,
    body: input ? JSON.stringify(input) : undefined,
    signal,
  });
  if (response.redirected || !response.headers.get("Content-Type")?.includes("application/json"))
    throw new Error(
      "No pudimos consultar el asistente. Verificá tu sesión y volvé a abrir el chat.",
    );
  return {
    status: response.status,
    result: (await response.json()) as
      AssistantAnswer | { ok?: false; error?: string; usage?: AssistantUsage; code?: string },
  };
}
export function FloatingChatbot({
  currencies,
  previewSnapshot,
}: {
  currencies: Currency[];
  previewSnapshot?: Snapshot;
}) {
  const preview = !!previewSnapshot,
    id = useId();
  const [open, setOpen] = useState(false),
    [expanded, setExpanded] = useState(false),
    [draft, setDraft] = useState(""),
    [messages, setMessages] = useState<Message[]>([]),
    [usage, setUsage] = useState<AssistantUsage | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [currency, setCurrency] = useState<Currency>(currencies[0] ?? "ARS");
  const [viewport, setViewport] = useState({ height: 0, inset: 0 });
  const panel = useRef<HTMLElement>(null),
    launcher = useRef<HTMLButtonElement>(null),
    transcript = useRef<HTMLDivElement>(null),
    inputRef = useRef<HTMLTextAreaElement>(null),
    controller = useRef<AbortController | null>(null),
    active = useRef(true),
    sending = useRef(false);
  const choices = currencies.length ? currencies : ["ARS" as const];
  const lastQuestion = useRef<Extract<AssistantRequest, { kind: "question" }> | null>(null);
  const wasOpened = useRef(false);
  useEffect(() => {
    if (open) wasOpened.current = true;
    else if (wasOpened.current) launcher.current?.focus({ preventScroll: true });
  }, [open]);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
      controller.current?.abort();
    };
  }, []);
  useEffect(() => {
    if (!choices.includes(currency)) setCurrency(choices[0]!);
  }, [currencies, currency]);
  useEffect(() => {
    if (!open) return;
    panel.current?.focus({ preventScroll: true });
    const vv = window.visualViewport;
    const update = () =>
      setViewport({
        height: vv?.height ?? window.innerHeight,
        inset: Math.max(
          0,
          window.innerHeight - (vv?.height ?? window.innerHeight) - (vv?.offsetTop ?? 0),
        ),
      });
    update();
    vv?.addEventListener("resize", update);
    vv?.addEventListener("scroll", update);
    window.addEventListener("resize", update);
    return () => {
      vv?.removeEventListener("resize", update);
      vv?.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, [open]);
  useEffect(() => {
    if (!open || preview) return;
    const abort = new AbortController();
    const load = () =>
      requestAssistant(undefined, abort.signal)
        .then(({ result, status }) => {
          if (!active.current || abort.signal.aborted) return;
          if (status === 200 && result.usage) setUsage(result.usage);
          else {
            setUsage(null);
            setError("No pudimos consultar tu cupo de IA. Las estadísticas siguen disponibles.");
          }
        })
        .catch(() => {
          if (!abort.signal.aborted && active.current) {
            setUsage(null);
            setError("No pudimos consultar el cupo de IA. Verificá tu conexión.");
          }
        });
    void load();
    const timer = window.setInterval(load, 60000);
    const visible = () => {
      if (document.visibilityState === "visible") void load();
    };
    document.addEventListener("visibilitychange", visible);
    return () => {
      abort.abort();
      clearInterval(timer);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [open, preview]);
  useEffect(() => {
    if (open && messages.length)
      transcript.current?.scrollTo({
        top: transcript.current.scrollHeight,
        behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth",
      });
  }, [open, messages, busy, error]);
  function close() {
    setOpen(false);
    launcher.current?.focus({ preventScroll: true });
  }
  async function send(
    payload: AssistantRequest,
    text: string,
    replay = false,
    submittedDraft?: string,
  ) {
    if (sending.current) return;
    sending.current = true;
    setBusy(true);
    setError("");
    if (!replay) setMessages((old) => [...old, { id: crypto.randomUUID(), role: "user", text }]);
    controller.current?.abort();
    const abort = new AbortController();
    controller.current = abort;
    try {
      let answer: AssistantAnswer;
      if (previewSnapshot) {
        // Ninguna pregunta de la vista previa llega al backend privado ni al modelo.
        if (payload.kind !== "statistic") throw new Error(previewQuestionMessage);
        const ledger = previewSnapshot.entries
          .filter((e) => e.kind === "income" || e.kind === "expense")
          .map((e) => ({
            ...e,
            kind: e.kind as "income" | "expense",
            occurrenceId: e.occurrenceId ?? null,
          }));
        answer = {
          ok: true,
          report: createFinancialReport(
            {
              ledger,
              statements: emptyStatementState(),
              payments: previewSnapshot.payments.map((p) => ({ ...p, id: p.id })),
            },
            presetPlan(payload.preset),
            payload.currency,
            previewSnapshot.asOf,
          ),
          usage: {
            limit: 0,
            used: 0,
            remaining: 0,
            available: false,
            reason: "unconfigured",
            resetsAt: new Date().toISOString(),
            globalResetsAt: new Date().toISOString(),
          },
          source: "statistics",
        };
      } else {
        const { result, status } = await requestAssistant(payload, abort.signal);
        if (!active.current || abort.signal.aborted) return;
        if (result.usage) setUsage(result.usage);
        if (!result.ok) {
          if (!shouldKeepAssistantRequest(result.code)) lastQuestion.current = null;
          if (status === 401 || status === 403) {
            lastQuestion.current = null;
            setMessages([]);
            setDraft("");
          }
          throw new Error(
            result.error ?? "No pudimos completar el análisis. Probá un período más corto.",
          );
        }
        answer = result;
      }
      if (active.current && !abort.signal.aborted) {
        setMessages((old) => [...old, { id: crypto.randomUUID(), role: "assistant", answer }]);
        if (payload.kind === "question") {
          lastQuestion.current = null;
          setDraft((current) => (current.trim() === payload.question ? "" : current));
        } else if (submittedDraft !== undefined) {
          setDraft((current) => (current.trim() === submittedDraft ? "" : current));
        }
      }
    } catch (cause) {
      if (active.current && !abort.signal.aborted)
        setError(cause instanceof Error ? cause.message : "No pudimos completar el análisis.");
    } finally {
      sending.current = false;
      if (active.current) setBusy(false);
    }
  }
  function submit(event?: FormEvent) {
    event?.preventDefault();
    if (sending.current || busy || draft.trim().length < 3) return;
    if (isAssistantHelpQuestion(draft)) {
      setError("");
      setMessages((old) => [
        ...old,
        { id: crypto.randomUUID(), role: "user", text: draft.trim() },
        { id: crypto.randomUUID(), role: "help" },
      ]);
      setDraft("");
      return;
    }
    const predefined = matchStatisticQuestion(draft);
    if (predefined) {
      lastQuestion.current = null;
      void send(
        { kind: "statistic", preset: predefined.id, currency },
        draft.trim(),
        false,
        draft.trim(),
      );
      return;
    }
    if (preview) {
      lastQuestion.current = null;
      setError(previewQuestionMessage);
      return;
    }
    const replay =
      lastQuestion.current?.question === draft.trim() && lastQuestion.current.currency === currency;
    const payload: Extract<AssistantRequest, { kind: "question" }> = replay
      ? lastQuestion.current!
      : {
          kind: "question",
          question: draft.trim(),
          requestKey: crypto.randomUUID(),
          currency,
          history: messages
            .filter((m): m is Extract<Message, { role: "user" }> => m.role === "user")
            .slice(-2)
            .map((m) => m.text.slice(0, 400)),
        };
    lastQuestion.current = payload;
    void send(payload, draft.trim(), replay);
  }
  const styles = {
    "--chat-viewport-height": viewport.height ? `${viewport.height}px` : "100dvh",
    "--chat-keyboard-inset": `${open ? viewport.inset : 0}px`,
  } as CSSProperties;
  return (
    <div
      className="floating-chatbot"
      data-open={open}
      data-expanded={expanded}
      data-keyboard={viewport.inset > 80 && open}
      style={styles}
      onKeyDown={(e) => {
        if (e.key === "Escape" && open && !e.defaultPrevented) {
          e.preventDefault();
          e.stopPropagation();
          close();
        }
      }}
    >
      {open && (
        <section
          ref={panel}
          className="chat-window"
          id={`${id}-window`}
          role="dialog"
          aria-modal="false"
          aria-labelledby={`${id}-title`}
          aria-describedby={`${id}-description`}
          tabIndex={-1}
        >
          <ChatHeader
            onClose={close}
            expanded={expanded}
            onToggleExpanded={() => setExpanded((current) => !current)}
            titleId={`${id}-title`}
            descriptionId={`${id}-description`}
          />
          <div
            className="chat-transcript"
            ref={transcript}
            tabIndex={0}
            role="region"
            aria-label="Conversación con Flujario AI"
          >
            <div className="chat-welcome">
              <span className="chat-eyebrow">TUS FINANZAS, MÁS CLARAS</span>
              <p>
                ¡Hola! Soy Flujario. Estoy acá para ayudarte a entender tus movimientos financieros.
                ¿Qué querés analizar hoy?
              </p>
              {preview && (
                <small>
                  Estás viendo datos ficticios. Podés escribir las consultas sugeridas; esta vista
                  no utiliza IA para interpretar preguntas libres.
                </small>
              )}
            </div>
            <SuggestedQuestions
              expanded={!messages.length}
              disabled={busy}
              onSelect={(preset) =>
                void send(
                  { kind: "statistic", preset, currency },
                  suggestedQuestions.find((q) => q.id === preset)!.question,
                )
              }
            />
            <div
              className="chat-messages"
              role="log"
              aria-label="Mensajes"
              aria-live="polite"
              aria-relevant="additions"
            >
              {messages.map((m) =>
                m.role === "user" ? (
                  <div className="chat-user-message" key={m.id}>
                    <span>Vos</span>
                    <p>{m.text}</p>
                  </div>
                ) : m.role === "help" ? (
                  <div className="chat-assistant-message" key={m.id}>
                    <span className="chat-answer-source">Ayuda de Flujario · sin IA</span>
                    <AssistantHelp
                      disabled={busy}
                      onSelect={(preset) =>
                        void send(
                          { kind: "statistic", preset, currency },
                          suggestedQuestions.find((q) => q.id === preset)!.question,
                        )
                      }
                    />
                  </div>
                ) : (
                  <div className="chat-assistant-message" key={m.id}>
                    <span className="chat-answer-source">
                      {m.answer.source === "statistics"
                        ? "Estadística · sin IA"
                        : "Interpretación con IA · cálculo de Flujario"}
                    </span>
                    <FinancialReportView report={m.answer.report} />
                  </div>
                ),
              )}
            </div>
            {busy && (
              <p className="chat-processing" role="status">
                <LoaderCircle className="chat-spin" size={16} />
                Analizando tus registros…
              </p>
            )}
            {error && (
              <div className="chat-error" role="alert">
                <p>{error}</p>
                {lastQuestion.current && (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={busy}
                    onClick={() => {
                      const previous = lastQuestion.current;
                      if (previous) void send(previous, previous.question, true);
                    }}
                  >
                    Consultar resultado del envío anterior
                  </Button>
                )}
              </div>
            )}
          </div>
          <div className="chat-bottom">
            <ChatUsageCounter usage={usage} preview={preview} />
            <ChatInput
              draft={draft}
              setDraft={setDraft}
              currency={currency}
              setCurrency={setCurrency}
              currencies={choices}
              busy={busy}
              onSubmit={submit}
              inputRef={inputRef}
            />
          </div>
        </section>
      )}
      <button
        ref={launcher}
        type="button"
        className="flujario-launcher"
        aria-label={open ? "Cerrar Flujario AI" : "Abrir chat con Flujario AI"}
        aria-expanded={open}
        aria-controls={`${id}-window`}
        aria-haspopup="dialog"
        aria-busy={busy}
        onClick={() => (open ? close() : setOpen(true))}
      >
        <span className="flujario-launcher-label" aria-hidden="true">
          <MessageCircle size={19} />
          <span>
            <small>Flujario AI</small>
            <strong>Abrir chat</strong>
          </span>
          <ChevronRight size={15} />
        </span>
        <FlujarioAvatar />
      </button>
    </div>
  );
}
