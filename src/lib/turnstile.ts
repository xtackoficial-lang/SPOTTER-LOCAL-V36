// ============================================================
// SPOTTER LOCAL — Cloudflare Turnstile (captcha) — v41
// ------------------------------------------------------------
// INTERRUPTOR: só fica ligado se VITE_TURNSTILE_SITE_KEY estiver
// preenchida (Cloudflare Pages → Settings → Environment variables).
// Sem a chave, a app comporta-se exactamente como antes.
//
// A verificação a sério é feita no SERVIDOR pelo próprio Supabase
// (Authentication → Attack Protection → Enable CAPTCHA → Turnstile
// + Secret key): o login/registo/recuperação sem token válido é
// recusado lá. O widget aqui só obtém o token para o enviar.
// ============================================================
export const TURNSTILE_SITE_KEY: string =
  (import.meta.env.VITE_TURNSTILE_SITE_KEY as string | undefined)?.trim() || "";
export const TURNSTILE_ENABLED = TURNSTILE_SITE_KEY.length > 0;

const SCRIPT_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

interface TurnstileApi {
  render: (el: HTMLElement, opts: Record<string, unknown>) => string;
  reset: (id?: string) => void;
  remove: (id?: string) => void;
}
declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

let loading: Promise<TurnstileApi> | null = null;
export function loadTurnstile(): Promise<TurnstileApi> {
  if (typeof window === "undefined") return Promise.reject(new Error("sem janela"));
  if (window.turnstile) return Promise.resolve(window.turnstile);
  if (loading) return loading;
  loading = new Promise<TurnstileApi>((resolve, reject) => {
    const s = document.createElement("script");
    s.src = SCRIPT_SRC;
    s.async = true;
    s.defer = true;
    s.onload = () =>
      window.turnstile ? resolve(window.turnstile) : reject(new Error("turnstile em falta"));
    s.onerror = () => {
      loading = null;
      reject(new Error("Não foi possível carregar a verificação de segurança."));
    };
    document.head.appendChild(s);
  });
  return loading;
}
