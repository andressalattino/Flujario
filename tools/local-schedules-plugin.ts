import type { Plugin } from "vite";

interface LocalSchedule {
  name: string;
  cron: string;
  startAfter: number;
  repeatAfter: number;
  retryAfter: number;
  timeout: number;
  successMessage: string;
  failureMessage: string;
}

// Vite calls the same Worker scheduled handler as Cloudflare.
function localSchedulePlugin(schedule: LocalSchedule): Plugin {
  return {
    name: schedule.name,
    apply: "serve",
    configureServer(server) {
      let timer: ReturnType<typeof setTimeout> | undefined;
      let controller: AbortController | undefined;
      let stopped = false;

      function queue(delay: number) {
        timer = setTimeout(run, delay);
        timer.unref();
      }

      async function run() {
        const address = server.httpServer?.address();
        if (stopped || !address || typeof address === "string") return;
        controller = new AbortController();
        const timeout = setTimeout(() => controller?.abort(), schedule.timeout);
        let nextDelay = schedule.repeatAfter;

        try {
          const response = await fetch(
            `http://127.0.0.1:${address.port}/cdn-cgi/local/explorer/api/local/scheduled?worker=flujario`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ cron: schedule.cron }),
              signal: controller.signal,
            },
          );
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          const result = (await response.json()) as {
            success?: boolean;
            result?: { outcome?: string };
          };
          if (!result.success || result.result?.outcome !== "ok")
            throw new Error("Falló el scheduled local.");
          server.config.logger.info(schedule.successMessage);
        } catch {
          nextDelay = schedule.retryAfter;
          if (!stopped) server.config.logger.warn(schedule.failureMessage);
        } finally {
          clearTimeout(timeout);
          if (!stopped) queue(nextDelay);
        }
      }

      server.httpServer?.once("listening", () => queue(schedule.startAfter));
      server.httpServer?.once("close", () => {
        stopped = true;
        clearTimeout(timer);
        controller?.abort();
      });
    },
  };
}

export function localNewsPlugin() {
  return localSchedulePlugin({
    name: "flujario-local-news",
    cron: "*/30 * * * *",
    startAfter: 1500,
    repeatAfter: 30 * 60 * 1000,
    retryAfter: 60000,
    timeout: 60000,
    successMessage: "[Flujario] Revisión local de noticias ejecutada.",
    failureMessage: "[Flujario] No se pudo revisar el RSS local. Se reintentará automáticamente.",
  });
}

export function localCatalogPlugin() {
  return localSchedulePlugin({
    name: "flujario-local-catalog",
    cron: "0 14 * * *",
    startAfter: 2500,
    repeatAfter: 86400000,
    retryAfter: 86400000,
    timeout: 45000,
    successMessage: "[Flujario] Revisión local del catálogo ejecutada; ver estado en Mercados.",
    failureMessage: "[Flujario] No se pudo ejecutar la revisión local del catálogo.",
  });
}
