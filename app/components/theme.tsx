import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { SunMoon } from "lucide-react";

export type ThemePreference = "light" | "dark" | "system";
const key = "flujario-theme";
export const parseTheme = (value: unknown): ThemePreference =>
  value === "light" || value === "dark" ? value : "system";
export function useResolvedTheme() {
  const [theme, setTheme] = useState<"light" | "dark" | null>(null);
  useEffect(() => {
    const apply = () =>
      setTheme(document.documentElement.dataset.theme === "dark" ? "dark" : "light");
    apply();
    const observer = new MutationObserver(apply);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });
    return () => observer.disconnect();
  }, []);
  return theme;
}
export const themeScript = `try{var t=localStorage.getItem("${key}");document.documentElement.dataset.theme=t==="dark"||t==="light"?t:matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light"}catch{document.documentElement.dataset.theme=matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light"}`;
const ThemeContext = createContext<{
  preference: ThemePreference;
  change: (value: ThemePreference) => void;
} | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [preference, setPreference] = useState<ThemePreference>("system");
  const current = useRef<ThemePreference>("system");
  function apply(value: ThemePreference) {
    current.current = value;
    setPreference(value);
    document.documentElement.dataset.theme =
      value === "system"
        ? matchMedia("(prefers-color-scheme: dark)").matches
          ? "dark"
          : "light"
        : value;
  }
  useEffect(() => {
    let saved: ThemePreference = "system";
    try {
      saved = parseTheme(localStorage.getItem(key));
    } catch {
      /* La preferencia funciona también durante esta visita sin almacenamiento. */
    }
    apply(saved);
    const media = matchMedia("(prefers-color-scheme: dark)");
    const system = () => {
      if (current.current === "system") apply("system");
    };
    const storage = (event: StorageEvent) => {
      if (event.key === key || event.key === null) apply(parseTheme(event.newValue));
    };
    media.addEventListener("change", system);
    window.addEventListener("storage", storage);
    return () => {
      media.removeEventListener("change", system);
      window.removeEventListener("storage", storage);
    };
  }, []);
  function change(value: ThemePreference) {
    apply(value);
    try {
      localStorage.setItem(key, value);
    } catch {
      /* Sin acceso a storage, se conserva durante la visita. */
    }
  }
  return <ThemeContext.Provider value={{ preference, change }}>{children}</ThemeContext.Provider>;
}
export function ThemePicker() {
  const context = useContext(ThemeContext);
  if (!context) throw new Error("ThemePicker necesita ThemeProvider.");
  return (
    <label className="theme-picker">
      <SunMoon size={16} aria-hidden="true" />
      <span className="sr-only">Tema de la web</span>
      <select
        aria-label="Tema de la web"
        value={context.preference}
        onChange={(event) => context.change(parseTheme(event.target.value))}
      >
        <option value="light">Claro</option>
        <option value="dark">Oscuro</option>
        <option value="system">Sistema</option>
      </select>
    </label>
  );
}
