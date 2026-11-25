import { useEffect, useRef } from "react";

export function useScrollReveal() {
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const container = root.current;
    if (!container || !("IntersectionObserver" in window)) return;
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (motion.matches) return;
    const elements = Array.from(container.querySelectorAll<HTMLElement>("[data-reveal]"));
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.setAttribute("data-reveal-state", "visible");
            observer.unobserve(entry.target);
          }
        }
      },
      { threshold: 0.08, rootMargin: "0px 0px -48px 0px" },
    );
    for (const element of elements) {
      // El HTML de servidor y el contenido que ya se ve nunca empiezan ocultos.
      if (element.getBoundingClientRect().top > window.innerHeight) {
        element.dataset.revealState = "pending";
        observer.observe(element);
      }
    }
    const revealAll = () => {
      if (!motion.matches) return;
      elements.forEach((element) => element.removeAttribute("data-reveal-state"));
      observer.disconnect();
    };
    const revealFocused = (event: FocusEvent) => {
      const element =
        event.target instanceof Element ? event.target.closest("[data-reveal]") : null;
      element?.setAttribute("data-reveal-state", "visible");
      if (element) observer.unobserve(element);
    };
    motion.addEventListener("change", revealAll);
    container.addEventListener("focusin", revealFocused);
    return () => {
      observer.disconnect();
      motion.removeEventListener("change", revealAll);
      container.removeEventListener("focusin", revealFocused);
      elements.forEach((element) => element.removeAttribute("data-reveal-state"));
    };
  }, []);
  return root;
}
