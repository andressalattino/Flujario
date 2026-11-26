import { cloudflare } from "@cloudflare/vite-plugin";
import { reactRouter } from "@react-router/dev/vite";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig, loadEnv } from "vite";
import { fileURLToPath } from "node:url";
import { localCatalogPlugin, localNewsPlugin } from "./tools/local-schedules-plugin.ts";

export default defineConfig(({ command, mode }) => {
  const localAI =
    command === "serve" &&
    (process.env.FLUJARIO_LOCAL_AI ??
      loadEnv(mode, process.cwd(), "AI_ALLOW_LOCAL").AI_ALLOW_LOCAL) === "true";
  return {
    plugins: [
      // El desarrollo local no debe abrir conexiones remotas de IA por defecto.
      cloudflare({
        viteEnvironment: { name: "ssr" },
        remoteBindings: localAI,
        config(worker) {
          // Workers AI no tiene simulador local. Se omite sólo durante DEV sin
          // opt-in explícito; la compilación conserva el binding de producción.
          if (command === "serve" && !localAI) worker.ai = undefined;
        },
      }),
      tailwindcss(),
      reactRouter(),
      localNewsPlugin(),
      localCatalogPlugin(),
    ],
    resolve: { alias: { "~": fileURLToPath(new URL("./app", import.meta.url)) } },
  };
});
