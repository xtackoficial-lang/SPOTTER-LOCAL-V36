// ============================================================
// XTACK SPOTTER — Autenticação real via Supabase
// Fallback para localStorage quando Supabase não está configurado
// ============================================================
import { supabase, SUPABASE_CONFIGURED } from "./supabase";

export interface AuthUser {
  id: string;
  email?: string;
  name?: string;
  profileType?: "personal" | "business" | null;
}

// Verifica se a PRÓPRIA conta (a sessão actual) foi suspensa pelo admin.
// Feito em segundo plano, depois do login já ter sido mostrado — nunca
// bloqueia a abertura da app (ver comentário grande em getCurrentUser()
// sobre porquê isso é importante em rede lenta). A política de RLS
// "Utilizador vê o seu perfil" já permite este SELECT sem precisar de
// nenhum privilégio extra — cada pessoa só lê a sua própria linha.
export async function isSelfSuspended(userId: string): Promise<boolean> {
  if (!SUPABASE_CONFIGURED || !supabase) return false;
  try {
    const { data, error } = await supabase
      .from("profiles")
      .select("suspended")
      .eq("id", userId)
      .maybeSingle();
    if (error || !data) return false;
    return Boolean(data.suspended);
  } catch {
    return false;
  }
}

// ---------- helpers localStorage (fallback offline) ----------
// Guarda uma "base" de contas locais (simulação de utilizadores), não apenas
// a sessão activa, para que signIn possa validar a password correctamente
// em vez de aceitar qualquer combinação ou criar contas às escondidas.
const LOCAL_USER_KEY = "xlocal.auth.user.v1";
const LOCAL_ACCOUNTS_KEY = "xlocal.auth.accounts.v1";

interface LocalAccount {
  id: string;
  email: string;
  passwordHash: string;
  name?: string;
  profileType?: "personal" | "business" | null;
}

// Hash simples (não-criptográfico) só para o modo demo/offline.
// NUNCA usar isto como substituto de hashing real em produção —
// no modo Supabase a password nunca passa por aqui, é tratada pelo backend.
async function simpleHash(value: string): Promise<string> {
  const enc = new TextEncoder().encode(value);
  const buf = await crypto.subtle.digest("SHA-256", enc);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function localGetSessionUser(): AuthUser | null {
  try {
    const raw = localStorage.getItem(LOCAL_USER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}
function localSetSessionUser(u: AuthUser | null) {
  try {
    if (u) localStorage.setItem(LOCAL_USER_KEY, JSON.stringify(u));
    else localStorage.removeItem(LOCAL_USER_KEY);
  } catch {
    /* ignorado: falha de quota/acesso ao localStorage */
  }
}
function localGetAccounts(): LocalAccount[] {
  try {
    const raw = localStorage.getItem(LOCAL_ACCOUNTS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}
function localSaveAccounts(accounts: LocalAccount[]) {
  try {
    localStorage.setItem(LOCAL_ACCOUNTS_KEY, JSON.stringify(accounts));
  } catch {
    /* ignorado: falha de quota/acesso ao localStorage */
  }
}
function localFindAccountByEmail(email: string): LocalAccount | undefined {
  const normalized = email.trim().toLowerCase();
  return localGetAccounts().find((a) => a.email.toLowerCase() === normalized);
}

// Sincroniza nome, cidade e categoria de interesse preferida (escolhidos
// no onboarding, que vive em localStorage) para a tabela public.profiles.
// Sem isto, o nome/cidade do utilizador NUNCA chegam ao Supabase — e as
// notificações automáticas personalizadas ("Olá {nome}, queres visitar
// {local}?"), que são geradas no servidor por uma Edge Function sem
// acesso a localStorage de ninguém, não teriam como saber o nome ou a
// cidade de quem vai receber a notificação.
// Falha em silêncio (best-effort): nunca deve impedir o onboarding de
// avançar só porque a sincronização de perfil falhou.
export async function syncProfileToSupabase(patch: {
  name?: string;
  province?: string;
  city?: string;
  country?: string;
  favoriteCategory?: string;
}): Promise<void> {
  if (!SUPABASE_CONFIGURED || !supabase) return;
  try {
    const { data } = await supabase.auth.getSession();
    const userId = data.session?.user?.id;
    if (!userId) return; // utilizador "convidado" sem conta — nada a sincronizar
    await supabase
      .from("profiles")
      .update({
        ...(patch.name !== undefined ? { name: patch.name } : {}),
        ...(patch.province !== undefined ? { province: patch.province } : {}),
        ...(patch.city !== undefined ? { city: patch.city } : {}),
        ...(patch.country !== undefined ? { country: patch.country } : {}),
        ...(patch.favoriteCategory !== undefined
          ? { favorite_category: patch.favoriteCategory }
          : {}),
      })
      .eq("id", userId);
  } catch (err) {
    console.warn("syncProfileToSupabase: falha ao sincronizar perfil.", err);
  }
}

// Persistir o tipo de perfil (pessoal/comercial) também junto à conta,
// não apenas no draft de onboarding em localStorage solto — assim o
// tipo de conta sobrevive mesmo limpando o draft de onboarding.
export async function setProfileType(
  userId: string,
  profileType: "personal" | "business",
): Promise<void> {
  if (SUPABASE_CONFIGURED && supabase) {
    try {
      await supabase.auth.updateUser({ data: { profileType } });
    } catch (err) {
      console.warn("setProfileType: Supabase indisponível, guardado apenas localmente.", err);
    }
  }
  const accounts = localGetAccounts();
  const idx = accounts.findIndex((a) => a.id === userId);
  if (idx >= 0) {
    accounts[idx] = { ...accounts[idx], profileType };
    localSaveAccounts(accounts);
  }
  const session = localGetSessionUser();
  if (session && session.id === userId) {
    localSetSessionUser({ ...session, profileType });
  }
}

// ---------- Sign Up ----------
export async function signUp(
  email: string,
  password: string,
  name?: string,
): Promise<{ user: AuthUser | null; error: string | null }> {
  if (SUPABASE_CONFIGURED && supabase) {
    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { name } },
      });
      if (error) return { user: null, error: error.message };
      if (!data.user) return { user: null, error: "Erro ao criar conta" };
      const u: AuthUser = {
        id: data.user.id,
        email: data.user.email,
        name,
        profileType: data.user.user_metadata?.profileType ?? null,
      };
      return { user: u, error: null };
    } catch (err) {
      console.warn("signUp: falha de rede ao contactar Supabase.", err);
      return {
        user: null,
        error: "Sem ligação à internet. Verifique a sua ligação e tente novamente.",
      };
    }
  }
  // Fallback offline: valida que o email ainda não existe
  const normalized = email.trim().toLowerCase();
  if (!normalized || !password || password.length < 6) {
    return { user: null, error: "Email inválido ou senha com menos de 6 caracteres" };
  }
  const existing = localFindAccountByEmail(normalized);
  if (existing) {
    return { user: null, error: "Já existe uma conta com este email. Tente entrar." };
  }
  const passwordHash = await simpleHash(password);
  const account: LocalAccount = {
    id: crypto.randomUUID(),
    email: normalized,
    passwordHash,
    name,
    profileType: null,
  };
  localSaveAccounts([...localGetAccounts(), account]);
  const u: AuthUser = {
    id: account.id,
    email: account.email,
    name: account.name,
    profileType: null,
  };
  localSetSessionUser(u);
  return { user: u, error: null };
}

// ---------- Sign In ----------
export async function signIn(
  email: string,
  password: string,
): Promise<{ user: AuthUser | null; error: string | null }> {
  if (SUPABASE_CONFIGURED && supabase) {
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) return { user: null, error: "Email ou senha incorrectos" };
      if (!data.user) return { user: null, error: "Erro ao entrar" };
      const u: AuthUser = {
        id: data.user.id,
        email: data.user.email,
        name: data.user.user_metadata?.name,
        profileType: data.user.user_metadata?.profileType ?? null,
      };
      return { user: u, error: null };
    } catch (err) {
      console.warn("signIn: falha de rede ao contactar Supabase.", err);
      return {
        user: null,
        error: "Sem ligação à internet. Verifique a sua ligação e tente novamente.",
      };
    }
  }
  // Fallback offline: agora valida mesmo a password e NUNCA cria conta nova aqui.
  const normalized = email.trim().toLowerCase();
  const account = localFindAccountByEmail(normalized);
  if (!account) {
    return { user: null, error: "Não existe conta com este email. Crie uma conta primeiro." };
  }
  const passwordHash = await simpleHash(password);
  if (account.passwordHash !== passwordHash) {
    return { user: null, error: "Email ou senha incorrectos" };
  }
  const u: AuthUser = {
    id: account.id,
    email: account.email,
    name: account.name,
    profileType: account.profileType ?? null,
  };
  localSetSessionUser(u);
  return { user: u, error: null };
}

// ---------- Sign In com Google / Apple (OAuth) ----------
// Requer que o provider correspondente esteja activado em
// Supabase Dashboard → Authentication → Providers, com o Client ID/Secret
// da Google Cloud Console ou Apple Developer respectivamente.
// Sem Supabase configurado, não há OAuth real possível (não existe
// servidor próprio a tratar disto) — cai num erro claro em vez de fingir
// que entrou, para não confundir "pareceu funcionar" com "entrou mesmo".
export async function signInWithOAuth(
  provider: "google" | "apple",
): Promise<{ error: string | null }> {
  if (!SUPABASE_CONFIGURED || !supabase) {
    return {
      error:
        "Login com " +
        (provider === "google" ? "Google" : "Apple") +
        " requer o Supabase configurado.",
    };
  }
  try {
    // redirectTo aponta de volta para a própria app (raiz). O Supabase
    // devolve o utilizador com a sessão já incluída na URL
    // (detectSessionInUrl: true trata disto automaticamente em main.tsx),
    // e o useAuth() existente apanha a sessão via onAuthStateChange.
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: `${window.location.origin}/`,
      },
    });
    if (error) return { error: error.message };
    // Em sucesso o browser é redireccionado para o provider — não há mais
    // nada a devolver aqui; o fluxo continua noutra navegação da página.
    return { error: null };
  } catch (err) {
    console.warn(`signInWithOAuth(${provider}): falha de rede.`, err);
    return { error: "Sem ligação à internet. Verifique a sua ligação e tente novamente." };
  }
}

// ---------- Sign Out ----------
export async function signOut(): Promise<void> {
  if (SUPABASE_CONFIGURED && supabase) {
    try {
      await supabase.auth.signOut();
    } catch (err) {
      console.warn(
        "signOut: falha ao contactar Supabase, a terminar sessão apenas localmente.",
        err,
      );
    }
  }
  localSetSessionUser(null);
}

// ---------- Get current user ----------
// CRÍTICO: usa getSession() em vez de getUser().
// getUser() faz SEMPRE uma chamada de rede para validar o token contra o
// servidor Supabase. Na abertura da app (sobretudo no APK, com rede lenta
// ou ainda a estabelecer ligação), essa chamada pode demorar, falhar por
// timeout, ou correr antes do token de refresh estar disponível — e cada
// uma dessas situações fazia cair no catch, devolvendo `null` e expulsando
// o utilizador para o login mesmo com uma sessão válida guardada.
// getSession() lê a sessão directamente do storage local (instantâneo, sem
// rede) e é a forma recomendada pelo Supabase para saber "há sessão?" no
// arranque da app. A validação/renovação do token continua a acontecer em
// segundo plano via onAuthStateChange (evento TOKEN_REFRESHED), sem nunca
// bloquear nem derrubar a sessão visível ao utilizador.
export async function getCurrentUser(): Promise<AuthUser | null> {
  if (SUPABASE_CONFIGURED && supabase) {
    try {
      const { data, error } = await supabase.auth.getSession();
      if (error) {
        console.warn("getCurrentUser: erro ao ler sessão local, a usar fallback.", error);
        return localGetSessionUser();
      }
      const su = data.session?.user;
      if (su) {
        const u: AuthUser = {
          id: su.id,
          email: su.email,
          name: su.user_metadata?.name,
          profileType: su.user_metadata?.profileType ?? null,
        };
        // mantém a sessão local sincronizada para que, mesmo que uma
        // próxima leitura do storage do Supabase falhe momentaneamente,
        // ainda exista uma cópia local válida e recente.
        localSetSessionUser(u);
        return u;
      }
      // Sem sessão no Supabase: ainda assim verifica se existe uma sessão
      // local recente antes de assumir "deslogado" — protege contra uma
      // leitura de storage que ainda não tenha sido hidratada a tempo.
      return localGetSessionUser();
    } catch (err) {
      console.warn("getCurrentUser: Supabase indisponível, a usar sessão local.", err);
      return localGetSessionUser();
    }
  }
  return localGetSessionUser();
}

// ---------- Listen to auth changes ----------
// Escuta TODOS os eventos relevantes do Supabase, incluindo:
// - INITIAL_SESSION: disparado uma vez ao arrancar, depois de o SDK ler o storage
// - TOKEN_REFRESHED: disparado em segundo plano quando o token é renovado
// - SIGNED_IN / SIGNED_OUT: ações explícitas do utilizador
// Em qualquer evento com sessão válida, a cópia local é actualizada — é isto
// que garante que localGetSessionUser() nunca fica "desactualizado" em
// relação ao que o Supabase realmente tem guardado.
export function onAuthChange(callback: (user: AuthUser | null) => void) {
  if (SUPABASE_CONFIGURED && supabase) {
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        const u: AuthUser = {
          id: session.user.id,
          email: session.user.email,
          name: session.user.user_metadata?.name,
          profileType: session.user.user_metadata?.profileType ?? null,
        };
        localSetSessionUser(u);
        callback(u);
      } else {
        localSetSessionUser(null);
        callback(null);
      }
    });
    return () => data.subscription.unsubscribe();
  }
  return () => {};
}
