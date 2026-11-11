// ============================================================
// Limpeza de dados de utilizador no aparelho
// ------------------------------------------------------------
// BUG (31/10/2026): ao sair da conta só o rascunho do perfil era apagado.
// Mensagens, conversas, favoritos, pedidos, plano, avaliações e o token de
// notificações da conta anterior ficavam no telemóvel, e quem entrava a
// seguir via/recebia coisas da outra pessoa. Tudo o que é "da pessoa" vive
// em localStorage com o prefixo "xlocal."; só se mantém o que é do
// APARELHO (idioma, introdução já vista, id do aparelho, bloqueio de
// tentativas de login, tema, sessão de admin e o sinal da Play Store).
// ============================================================
const KEEP_PREFIXES = [
  "xlocal.locale",
  "xlocal.intro",
  "xlocal.device-id",
  "xlocal.play",
  "xlocal.guard",
  "xlocal.theme",
  "xlocal.admin",
  "xlocal.auth.user", // sessão do modo local
  "xlocal.auth.accounts", // contas do modo local sem Supabase (só desenvolvimento)
  "xlocal.last-uid",
];
export const LAST_UID_KEY = "xlocal.last-uid.v1";

export function wipeLocalUserData(): void {
  if (typeof window === "undefined") return;
  try {
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith("xlocal.") && !KEEP_PREFIXES.some((p) => k.startsWith(p))) keys.push(k);
    }
    keys.forEach((k) => localStorage.removeItem(k));
  } catch {
    /* localStorage indisponível */
  }
  try {
    const keep = sessionStorage.getItem("xlocal.play.v1");
    sessionStorage.clear();
    if (keep) sessionStorage.setItem("xlocal.play.v1", keep);
  } catch {
    /* ignorar */
  }
  window.dispatchEvent(new Event("xlocal-data-wiped"));
}

export function rememberUid(uid: string | null): void {
  try {
    if (uid) localStorage.setItem(LAST_UID_KEY, uid);
    else localStorage.removeItem(LAST_UID_KEY);
  } catch {
    /* ignorar */
  }
}

/** Devolve true (e limpa) se quem entrou agora não é quem usou este aparelho por último. */
export function wipeIfDifferentUser(uid: string): boolean {
  let last: string | null = null;
  try {
    last = localStorage.getItem(LAST_UID_KEY);
    if (!last) {
      // Aparelho de antes desta correção: o rascunho do onboarding guarda o dono.
      const raw = localStorage.getItem("xlocal.onboarding.v1");
      if (raw) last = (JSON.parse(raw) as { ownerUid?: string }).ownerUid ?? null;
    }
  } catch {
    /* ignorar */
  }
  if (last && last !== uid) {
    wipeLocalUserData();
    rememberUid(uid);
    return true;
  }
  rememberUid(uid);
  return false;
}
