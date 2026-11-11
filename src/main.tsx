import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "@tanstack/react-router";
import { getRouter } from "./router";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { getLocale, loadLocale } from "./lib/i18n";
import { initPlayContext } from "./lib/play-context";
import "./styles.css";

initPlayContext();
const router = getRouter();

const rootElement = document.getElementById("root")!;

function mount() {
  createRoot(rootElement).render(
    <StrictMode>
      <ErrorBoundary>
        <RouterProvider router={router} />
      </ErrorBoundary>
    </StrictMode>,
  );
}

// Idioma ≠ PT: espera (no máximo 1,5 s) pelo ficheiro do idioma para não
// piscar em português no arranque; se demorar ou falhar, abre na mesma.
Promise.race([loadLocale(getLocale()), new Promise<void>((r) => setTimeout(r, 1500))])
  .catch(() => undefined)
  .then(mount);

// Esconder splash screen nativo assim que o React montar
if (
  typeof window !== "undefined" &&
  typeof (window as unknown as { __hideSplash?: () => void }).__hideSplash === "function"
) {
  (window as unknown as { __hideSplash: () => void }).__hideSplash();
}

// Registar o Service Worker para suporte offline e instalabilidade PWA
// completa. Nunca bloqueia nem trava o arranque da app: se o browser
// não suportar Service Workers, ou o registo falhar por qualquer
// razão (ex: servido por http:// em vez de https://), a app continua
// a funcionar normalmente — apenas sem cache offline.
if (typeof window !== "undefined" && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch((err) => {
      console.warn(
        "Service Worker: registo falhou (app continua a funcionar sem cache offline).",
        err,
      );
    });
  });
}
