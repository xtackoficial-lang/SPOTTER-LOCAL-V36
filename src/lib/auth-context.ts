// ============================================================
// XTACK SPOTTER — Context de autenticação global
// Hook useAuth() disponível em toda a app
// ============================================================
import { useEffect, useState } from "react";
import {
  getCurrentUser,
  onAuthChange,
  signIn,
  signUp,
  signInWithOAuth,
  signOut as authSignOut,
  setProfileType as authSetProfileType,
  syncProfileToSupabase,
  isSelfSuspended,
  type AuthUser,
} from "./auth";

let globalUser: AuthUser | null = null;
// Distingue "ainda não sabemos" de "sabemos que não há ninguém autenticado".
// Sem esta flag, um globalUser === null inicial era indistinguível de um
// utilizador deslogado, e qualquer componente que montasse depois da
// primeira resolução via top-level ficava preso a pensar que precisava
// de recarregar — ou, peior, mostrava brevemente o ecrã de login antes
// da sessão real (válida) chegar.
let hydrated = false;
const listeners = new Set<(u: AuthUser | null) => void>();
const hydrationListeners = new Set<(h: boolean) => void>();
// Mostra um aviso quando a sessão é terminada por a conta estar
// suspensa (em vez de um logout normal, silencioso) — ver notifyAll().
let suspendedNotice = false;
const suspendedListeners = new Set<(s: boolean) => void>();
// Evita sincronizar o mesmo utilizador repetidamente a cada notifyAll()
// (que corre em todo login/refresh de token) — só quando o id muda.
let lastSyncedUserId: string | null = null;

function notifyAll(u: AuthUser | null) {
  globalUser = u;
  listeners.forEach((fn) => fn(u));
  // Sincroniza o nome da conta (Google/Apple/Email) para public.profiles.
  // É a única fonte fiável de nome para utilizadores que entraram via
  // OAuth, já que o onboarding pessoal nunca pede explicitamente o nome.
  // Best-effort: se falhar, não afecta a navegação nem a sessão.
  if (u?.id && u.name && u.id !== lastSyncedUserId) {
    lastSyncedUserId = u.id;
    syncProfileToSupabase({ name: u.name }).catch(() => {});
  }
  // Verificação de conta suspensa (2026-07-08): feita em segundo plano,
  // DEPOIS de já ter mostrado a sessão local — nunca atrasa a abertura
  // da app (ver o porquê em getCurrentUser(), em auth.ts). Sem isto,
  // "Suspender" no painel de admin só mudava uma cor no ecrã do admin,
  // sem qualquer efeito real na conta suspensa.
  if (u?.id) {
    isSelfSuspended(u.id).then((suspended) => {
      if (!suspended) return;
      authSignOut().then(() => {
        suspendedNotice = true;
        suspendedListeners.forEach((fn) => fn(true));
        globalUser = null;
        listeners.forEach((fn) => fn(null));
      });
    });
  }
}

function notifyHydrated() {
  hydrated = true;
  hydrationListeners.forEach((fn) => fn(true));
}

// Inicializar uma única vez ao carregar o módulo. getCurrentUser() já lê a
// sessão local (getSession(), sem rede) por isto é rápido e fiável mesmo
// em ligações lentas — ver src/lib/auth.ts.
getCurrentUser()
  .then((u) => {
    notifyAll(u);
    notifyHydrated();
  })
  .catch(() => {
    notifyAll(null);
    notifyHydrated();
  });
onAuthChange((u) => notifyAll(u));

export function useAuth() {
  const [user, setUser] = useState<AuthUser | null>(globalUser);
  const [isHydrated, setIsHydrated] = useState(hydrated);
  const [suspended, setSuspended] = useState(suspendedNotice);

  useEffect(() => {
    listeners.add(setUser);
    hydrationListeners.add(setIsHydrated);
    suspendedListeners.add(setSuspended);
    return () => {
      listeners.delete(setUser);
      hydrationListeners.delete(setIsHydrated);
      suspendedListeners.delete(setSuspended);
    };
  }, []);

  const clearSuspendedNotice = () => {
    suspendedNotice = false;
    suspendedListeners.forEach((fn) => fn(false));
  };

  const login = async (email: string, password: string) => {
    const result = await signIn(email, password);
    if (result.user) notifyAll(result.user);
    return result;
  };

  const loginWithOAuth = async (provider: "google" | "apple") => {
    // Não há "user" para notificar aqui: o browser é redireccionado para o
    // provider e a sessão só fica disponível depois do redirect de volta,
    // altura em que onAuthChange (já escutado a nível de módulo) trata de
    // notificar todos os componentes automaticamente.
    return signInWithOAuth(provider);
  };

  const register = async (email: string, password: string, name?: string) => {
    const result = await signUp(email, password, name);
    if (result.user) notifyAll(result.user);
    return result;
  };

  const logout = async () => {
    await authSignOut();
    notifyAll(null);
  };

  // Liga a escolha pessoal/comercial do onboarding à conta autenticada,
  // para que o tipo de conta sobreviva a troca de dispositivo / limpeza de cache,
  // e não viva só no draft de onboarding em localStorage.
  const setProfileType = async (profileType: "personal" | "business") => {
    if (!user) return;
    await authSetProfileType(user.id, profileType);
    notifyAll({ ...user, profileType });
  };

  // "loading" mantido por compatibilidade com o resto da app: enquanto não
  // tivermos a primeira resposta de getCurrentUser(), está a carregar.
  return {
    user,
    loading: !isHydrated,
    login,
    loginWithOAuth,
    register,
    logout,
    setProfileType,
    isLoggedIn: !!user,
    suspended,
    clearSuspendedNotice,
  };
}
