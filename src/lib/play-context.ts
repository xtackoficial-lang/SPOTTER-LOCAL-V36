// ============================================================
// Versão da Play Store (TWA)
// ------------------------------------------------------------
// A app publicada na Google Play é este mesmo site dentro de uma "casca"
// Android (TWA). A Google exige que compras de funções digitais dentro de
// apps da loja usem o Play Billing. Por isso, nessa versão, os ecrãs de
// compra de planos e de publicações pagas ficam escondidos (ver
// PlayPlansNotice). Reservas e pedidos (serviços/produtos físicos) NÃO
// mudam. No site e na PWA instalada pelo Chrome nada muda.
//
// Como se deteta: ao abrir pela TWA o browser envia como origem
// "android-app://<pacote>". Também aceita ?origem=play no endereço de
// arranque (configurável no PWABuilder) e serve para testar. O sinal fica em
// sessionStorage (só nesta sessão) — o armazenamento normal é partilhado com
// o Chrome e a marca contaminaria o site.
// ============================================================
const KEY = "xlocal.play.v1";

/** Chamar uma vez no arranque (main.tsx), antes de desenhar a app. */
export function initPlayContext(): void {
  if (typeof window === "undefined") return;
  try {
    const fromReferrer = (document.referrer || "").startsWith("android-app://");
    const fromParam = new URLSearchParams(window.location.search).get("origem") === "play";
    if (fromReferrer || fromParam) sessionStorage.setItem(KEY, "1");
  } catch {
    /* sessionStorage indisponível: trata como site normal */
  }
}

export function isPlayStoreApp(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return sessionStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}
