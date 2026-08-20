// ============================================================
// XTACK Admin — Gestao de comerciantes via Supabase
// v5 — Split de shop-data.ts (2026-07-16): tudo o que a app publica
//      tambem precisa (merchants, planos, payment config/proofs)
//      passou a viver em ./shop-data. Este ficheiro fica so com o
//      que e EXCLUSIVO do painel /admin. E isto que permite ao
//      scripts/store-build.mjs remover fisicamente o admin do
//      bundle da loja sem quebrar payment.tsx/boost.tsx/billing-engine.ts.
// ============================================================
import { supabase, SUPABASE_CONFIGURED } from "./supabase";
import { getMerchants } from "./shop-data";

export {
  type MerchantRecord,
  getMerchants,
  updateMerchant,
  addMerchant,
  deleteMerchant,
  PLAN_LABELS,
  PLAN_PRICES,
  STATUS_LABELS,
  CATEGORY_LABELS,
  type PaymentConfig,
  getPaymentConfig,
  savePaymentConfig,
  type PaymentProof,
  getPaymentProofs,
  addPaymentProof,
  updatePaymentProofNote,
  reviewPaymentProof,
} from "./shop-data";

// ── Contas de utilizador (pessoais e comerciais) ──────────────────────
// BUG CORRIGIDO (auditoria 2026-07-08): antes não existia nada disto —
// admin.tsx gerava 5 contas inventadas (Ana Silva, Carlos Melo...) e
// guardava-as no telemóvel, porque não havia forma de ler contas reais
// da tabela "profiles" (bloqueada por RLS a quem não fosse a própria
// pessoa). Ver bloco "ADMIN REAL" no fim do SUPABASE_SETUP.sql — só
// funciona depois desse SQL correr e a tua conta estar na tabela
// "admins".
export interface AccountRecord {
  id: string;
  name: string;
  email?: string;
  profileType: "personal" | "business" | null;
  province?: string;
  city?: string;
  country?: string;
  joinedAt: string;
  suspended: boolean;
}

export async function fetchAccounts(): Promise<AccountRecord[]> {
  if (SUPABASE_CONFIGURED && supabase) {
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, name, email, profile_type, province, city, country, created_at, suspended")
        .order("created_at", { ascending: false });
      if (!error && data) {
        return data.map((r) => ({
          id: r.id as string,
          name: (r.name as string) || "—",
          email: r.email as string | undefined,
          profileType: r.profile_type as "personal" | "business" | null,
          province: r.province as string | undefined,
          city: r.city as string | undefined,
          country: r.country as string | undefined,
          joinedAt: r.created_at as string,
          suspended: Boolean(r.suspended),
        }));
      }
      if (error) console.warn("fetchAccounts: erro do Supabase.", error.message);
    } catch (err) {
      console.warn("fetchAccounts: Supabase indisponível.", err);
    }
  }
  // Sem dados inventados: se falhar ou não estiveres autorizado como
  // admin (ver is_admin() no SQL), devolve lista vazia — a interface já
  // trata bem este caso.
  return [];
}

export async function setAccountSuspended(id: string, suspended: boolean): Promise<boolean> {
  if (!SUPABASE_CONFIGURED || !supabase) return false;
  try {
    const { error } = await supabase.from("profiles").update({ suspended }).eq("id", id);
    if (error) {
      console.warn("setAccountSuspended: erro do Supabase.", error.message);
      return false;
    }
    await addAuditLog(suspended ? "suspend_account" : "unsuspend_account", id, "");
    return true;
  } catch (err) {
    console.warn("setAccountSuspended: Supabase indisponível.", err);
    return false;
  }
}

export interface AdminAuditLog {
  id: string;
  action: string;
  target: string;
  detail: string;
  at: string;
}

export type AdminAction = "activate" | "block" | "unblock" | "change_plan" | "add_note";


// ── SEGURANÇA (sessão continua em localStorage — é só do browser do admin) ──
const ADMIN_HASH = "29e66bc2d2abf3713471691afd5c27331a28607fb32caff350e3b01fe930341a";
const SESSION_KEY = "xlocal.admin.session.v2";
const ATTEMPTS_KEY = "xlocal.admin.attempts.v1";
const LOCKOUT_KEY = "xlocal.admin.lockout.v1";
const SESSION_TTL_MS = 5 * 60 * 1000; // Bloqueio automático em 5 minutos
const MAX_ATTEMPTS = 5;
const LOCKOUT_MS = 15 * 60 * 1000;

async function sha256(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function isLockedOut(): boolean {
  try {
    const raw = localStorage.getItem(LOCKOUT_KEY);
    if (!raw) return false;
    const until = parseInt(raw, 10);
    if (Date.now() < until) return true;
    localStorage.removeItem(LOCKOUT_KEY);
    localStorage.removeItem(ATTEMPTS_KEY);
    return false;
  } catch {
    return false;
  }
}

export function getLockoutRemaining(): number {
  try {
    const raw = localStorage.getItem(LOCKOUT_KEY);
    if (!raw) return 0;
    return Math.max(0, parseInt(raw, 10) - Date.now());
  } catch {
    return 0;
  }
}

export function getFailedAttempts(): number {
  try {
    return parseInt(localStorage.getItem(ATTEMPTS_KEY) ?? "0", 10);
  } catch {
    return 0;
  }
}

export function getAdminSession(): boolean {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return false;
    const { token, expires } = JSON.parse(raw);
    if (!token || Date.now() > expires) {
      localStorage.removeItem(SESSION_KEY);
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

export async function adminLogin(password: string): Promise<"ok" | "wrong" | "locked"> {
  if (isLockedOut()) return "locked";
  const hash = await sha256(password);
  if (hash === ADMIN_HASH) {
    localStorage.removeItem(ATTEMPTS_KEY);
    localStorage.removeItem(LOCKOUT_KEY);
    const session = { token: crypto.randomUUID(), expires: Date.now() + SESSION_TTL_MS };
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    await addAuditLog("login", "admin", "Sessão iniciada");
    return "ok";
  }
  const attempts = getFailedAttempts() + 1;
  localStorage.setItem(ATTEMPTS_KEY, String(attempts));
  if (attempts >= MAX_ATTEMPTS) {
    localStorage.setItem(LOCKOUT_KEY, String(Date.now() + LOCKOUT_MS));
    localStorage.setItem(ATTEMPTS_KEY, "0");
  }
  return "wrong";
}

export async function adminLogout() {
  await addAuditLog("logout", "admin", "Sessão terminada");
  localStorage.removeItem(SESSION_KEY);
}

export function adminChangePassword(currentPw: string, _newPw: string): Promise<boolean> {
  return sha256(currentPw).then((h) => h === ADMIN_HASH);
}


// ── AUDIT LOG — Supabase com fallback localStorage ──────────────────
export async function addAuditLog(action: string, target: string, detail: string) {
  const entry = {
    id: crypto.randomUUID(),
    action,
    target,
    detail,
    at: new Date().toISOString(),
  };
  if (SUPABASE_CONFIGURED && supabase) {
    try {
      await supabase.from("admin_audit_log").insert({
        id: entry.id,
        action: entry.action,
        target: entry.target,
        detail: entry.detail,
        created_at: entry.at,
      });
      return;
    } catch {
      /* fallback abaixo */
    }
  }
  // fallback localStorage
  try {
    const raw = localStorage.getItem("xlocal.admin.audit.v1");
    const logs: AdminAuditLog[] = raw ? JSON.parse(raw) : [];
    logs.unshift(entry);
    if (logs.length > 200) logs.splice(200);
    localStorage.setItem("xlocal.admin.audit.v1", JSON.stringify(logs));
  } catch {
    /* ignorado */
  }
}

export async function readAuditLog(): Promise<AdminAuditLog[]> {
  if (SUPABASE_CONFIGURED && supabase) {
    try {
      const { data, error } = await supabase
        .from("admin_audit_log")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(200);
      if (!error && data) {
        return data.map((r) => ({
          id: r.id,
          action: r.action,
          target: r.target,
          detail: r.detail,
          at: r.created_at,
        }));
      }
    } catch {
      /* fallback */
    }
  }
  try {
    const raw = localStorage.getItem("xlocal.admin.audit.v1");
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function clearAuditLog() {
  if (SUPABASE_CONFIGURED && supabase) {
    supabase
      .from("admin_audit_log")
      .delete()
      .lt("created_at", new Date().toISOString())
      .then(() => {});
  }
  localStorage.removeItem("xlocal.admin.audit.v1");
}


// ── EXPORTAR CSV ──────────────────────────────────────────────────────
export async function exportMerchantsCSV(): Promise<string> {
  const merchants = await getMerchants();
  const header =
    "ID,Nome,Proprietário,Categoria,Cidade,Telefone,Email,Plano,Estado,Aderiu,Renova,Último pagamento,Método,Produtos";
  const rows = merchants.map((m) =>
    [
      m.id,
      m.businessName,
      m.ownerName,
      m.category,
      m.city,
      m.phone,
      m.email ?? "",
      m.planId,
      m.status,
      m.joinedAt.slice(0, 10),
      m.renewsAt.slice(0, 10),
      m.lastPaymentAt?.slice(0, 10) ?? "",
      m.paymentMethod ?? "",
      m.productCount,
    ]
      .map((v) => `"${String(v).replace(/"/g, '""')}"`)
      .join(","),
  );
  return [header, ...rows].join("\n");
}

export async function downloadCSV() {
  const csv = await exportMerchantsCSV();
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `spotter-comerciantes-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  await addAuditLog("export", "merchants", "CSV exportado");
}


// ── FEATURE FLAGS — Supabase ─────────────────────────────────────────
export interface FeatureFlag {
  key: string;
  label: string;
  enabled: boolean;
  description: string;
  updatedAt: string;
}

export const DEFAULT_FLAGS: FeatureFlag[] = [
  {
    key: "chat_ai",
    label: "Chat com IA",
    enabled: false,
    description: "Activa o chat com IA para comerciantes Premium",
    updatedAt: new Date().toISOString(),
  },
  {
    key: "ghost_mode",
    label: "Modo Fantasma",
    enabled: true,
    description: "Permite navegar sem guardar histórico",
    updatedAt: new Date().toISOString(),
  },
  {
    key: "push_notifications",
    label: "Push Notifications",
    enabled: true,
    description: "Notificações via Firebase FCM",
    updatedAt: new Date().toISOString(),
  },
  {
    key: "radius_filter",
    label: "Filtro de Raio",
    enabled: true,
    description: "Slider de raio de descoberta nos utilizadores",
    updatedAt: new Date().toISOString(),
  },
  {
    key: "promo_banners",
    label: "Banners Promocionais",
    enabled: false,
    description: "Banners sazonais no topo do app",
    updatedAt: new Date().toISOString(),
  },
];

export async function getFeatureFlags(): Promise<FeatureFlag[]> {
  if (SUPABASE_CONFIGURED && supabase) {
    try {
      const { data, error } = await supabase
        .from("admin_settings")
        .select("value")
        .eq("key", "feature_flags")
        .single();
      if (!error && data?.value) {
        const saved = data.value as FeatureFlag[];
        const savedKeys = new Set(saved.map((f) => f.key));
        return [...saved, ...DEFAULT_FLAGS.filter((f) => !savedKeys.has(f.key))];
      }
    } catch {
      /* fallback */
    }
  }
  try {
    const raw = localStorage.getItem("xlocal.admin.feature_flags.v1");
    if (raw) {
      const saved: FeatureFlag[] = JSON.parse(raw);
      const savedKeys = new Set(saved.map((f) => f.key));
      return [...saved, ...DEFAULT_FLAGS.filter((f) => !savedKeys.has(f.key))];
    }
  } catch {
    /* ignorado */
  }
  return DEFAULT_FLAGS;
}

export async function toggleFeatureFlag(key: string, enabled: boolean): Promise<FeatureFlag[]> {
  const flags = (await getFeatureFlags()).map((f) =>
    f.key === key ? { ...f, enabled, updatedAt: new Date().toISOString() } : f,
  );
  if (SUPABASE_CONFIGURED && supabase) {
    try {
      await supabase
        .from("admin_settings")
        .upsert({ key: "feature_flags", value: flags, updated_at: new Date().toISOString() });
      return flags;
    } catch {
      /* fallback */
    }
  }
  try {
    localStorage.setItem("xlocal.admin.feature_flags.v1", JSON.stringify(flags));
  } catch {
    /* ignorado */
  }
  return flags;
}


// ── PUSH CAMPAIGNS — Supabase ────────────────────────────────────────
export interface PushCampaign {
  id: string;
  title: string;
  body: string;
  target: "all" | "merchants" | "premium_merchants" | "inactive_users";
  city?: string;
  sentAt: string;
  sentBy: string;
  estimatedReach: number;
}

export async function getPushCampaigns(): Promise<PushCampaign[]> {
  if (SUPABASE_CONFIGURED && supabase) {
    try {
      const { data, error } = await supabase
        .from("push_campaigns")
        .select("*")
        .order("sent_at", { ascending: false })
        .limit(50);
      if (!error && data)
        return data.map((r) => ({
          id: r.id as string,
          title: r.title as string,
          body: r.body as string,
          target: r.target as PushCampaign["target"],
          city: r.city as string | undefined,
          sentAt: r.sent_at as string,
          sentBy: r.sent_by as string,
          estimatedReach: r.estimated_reach as number,
        }));
    } catch {
      /* fallback */
    }
  }
  try {
    const raw = localStorage.getItem("xlocal.admin.push_campaigns.v1");
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export async function savePushCampaign(
  campaign: Omit<PushCampaign, "id" | "sentAt">,
): Promise<PushCampaign[]> {
  const now = new Date().toISOString();
  const newCampaign: PushCampaign = { ...campaign, id: `push_${Date.now()}`, sentAt: now };
  if (SUPABASE_CONFIGURED && supabase) {
    try {
      await supabase.from("push_campaigns").insert({
        id: newCampaign.id,
        title: newCampaign.title,
        body: newCampaign.body,
        target: newCampaign.target,
        city: newCampaign.city ?? null,
        sent_at: now,
        sent_by: newCampaign.sentBy,
        estimated_reach: newCampaign.estimatedReach,
      });
      return getPushCampaigns();
    } catch {
      /* fallback */
    }
  }
  try {
    const raw = localStorage.getItem("xlocal.admin.push_campaigns.v1");
    const campaigns: PushCampaign[] = raw ? JSON.parse(raw) : [];
    campaigns.unshift(newCampaign);
    localStorage.setItem("xlocal.admin.push_campaigns.v1", JSON.stringify(campaigns));
  } catch {
    /* ignorado */
  }
  return getPushCampaigns();
}
