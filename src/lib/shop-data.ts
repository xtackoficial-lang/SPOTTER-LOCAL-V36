// ============================================================
// XTACK Spotter — Dados de negocios/planos/pagamentos partilhados
// ------------------------------------------------------------
// Usadas TANTO pela app publica (payment.tsx, boost.tsx, billing-engine.ts)
// COMO pelo painel /admin. Por isso vivem fora de admin-storage.ts,
// que na build de loja e removido fisicamente do bundle.
// ============================================================
import { supabase, SUPABASE_CONFIGURED } from "./supabase";

// ── TIPOS ──────────────────────────────────────────────────────────────
export interface MerchantRecord {
  id: string;
  businessName: string;
  ownerName: string;
  category: string;
  city: string;
  phone: string;
  email?: string;
  planId: "free" | "starter" | "pro" | "premium";
  status: "active" | "trial" | "overdue" | "blocked";
  joinedAt: string;
  renewsAt: string;
  lastPaymentAt?: string;
  paymentMethod: "mpesa" | "emola" | "manual" | null;
  notes?: string;
  productCount: number;
}


// BUG CORRIGIDO (auditoria 2026-07-08): existia aqui uma funcao
// seedMerchants() com negocios inventados. Removida.

// ── MERCHANTS — lê da tabela businesses do Supabase ──────────────────
function rowToMerchant(r: Record<string, unknown>): MerchantRecord {
  return {
    id: r.id as string,
    businessName: (r.business_name as string) ?? "",
    ownerName: (r.owner_name as string) ?? "",
    category: (r.category as string) ?? "",
    city: (r.city as string) ?? "",
    phone: (r.phone as string) ?? "",
    email: r.email as string | undefined,
    planId: (r.plan_id as MerchantRecord["planId"]) ?? "free",
    status: (r.plan_status as MerchantRecord["status"]) ?? "active",
    joinedAt: (r.created_at as string) ?? new Date().toISOString(),
    renewsAt: (r.plan_renews_at as string) ?? new Date().toISOString(),
    lastPaymentAt: r.last_payment_at as string | undefined,
    paymentMethod: (r.payment_method as MerchantRecord["paymentMethod"]) ?? null,
    notes: r.notes as string | undefined,
    productCount: (r.product_count as number) ?? 0,
  };
}

// BUG CORRIGIDO (auditoria 2026-07-08): existia aqui uma função
// seedMerchants() com 5 negócios completamente inventados (Bom Gosto
// Restaurante, Ponte Cais Beach Bar...), usada sempre que a query ao
// Supabase falhava — sem aviso nenhum de que eram fictícios. Removida;
// getMerchants() devolve agora uma lista vazia real nesse caso.

export async function getMerchants(): Promise<MerchantRecord[]> {
  if (SUPABASE_CONFIGURED && supabase) {
    try {
      const { data, error } = await supabase
        .from("businesses")
        .select(
          "id, business_name, owner_name, category, city, phone, email, plan_id, plan_status, created_at, plan_renews_at, last_payment_at, payment_method, notes",
        )
        .order("created_at", { ascending: false });
      if (!error && data) {
        // buscar contagem de produtos por negócio
        const ids = data.map((r) => r.id as string);
        const productCounts: Record<string, number> = {};
        if (ids.length > 0) {
          const { data: prods } = await supabase
            .from("products")
            .select("business_id")
            .in("business_id", ids);
          if (prods) {
            for (const p of prods) {
              productCounts[p.business_id as string] =
                (productCounts[p.business_id as string] ?? 0) + 1;
            }
          }
        }
        return data.map((r) => ({
          ...rowToMerchant(r as Record<string, unknown>),
          productCount: productCounts[r.id as string] ?? 0,
        }));
      }
    } catch (err) {
      console.warn("getMerchants: Supabase indisponível.", err);
    }
  }
  // BUG CORRIGIDO (auditoria 2026-07-08): antes caía para
  // seedMerchants(), uma lista de negócios completamente inventados
  // ("Bom Gosto Restaurante", etc.) sem aviso nenhum — parecia que
  // havia negócios reais na plataforma quando não havia nenhum. Agora
  // devolve mesmo uma lista vazia; a interface já trata bem esse caso
  // ("Nenhum comerciante encontrado").
  return [];
}

export async function updateMerchant(
  id: string,
  patch: Partial<MerchantRecord>,
): Promise<MerchantRecord[]> {
  const supabasePatch: Record<string, unknown> = {};
  if (patch.businessName !== undefined) supabasePatch.business_name = patch.businessName;
  if (patch.ownerName !== undefined) supabasePatch.owner_name = patch.ownerName;
  if (patch.category !== undefined) supabasePatch.category = patch.category;
  if (patch.city !== undefined) supabasePatch.city = patch.city;
  if (patch.phone !== undefined) supabasePatch.phone = patch.phone;
  if (patch.email !== undefined) supabasePatch.email = patch.email;
  if (patch.planId !== undefined) supabasePatch.plan_id = patch.planId;
  if (patch.status !== undefined) supabasePatch.plan_status = patch.status;
  if (patch.renewsAt !== undefined) supabasePatch.plan_renews_at = patch.renewsAt;
  if (patch.lastPaymentAt !== undefined) supabasePatch.last_payment_at = patch.lastPaymentAt;
  if (patch.paymentMethod !== undefined) supabasePatch.payment_method = patch.paymentMethod;
  if (patch.notes !== undefined) supabasePatch.notes = patch.notes;

  if (SUPABASE_CONFIGURED && supabase && Object.keys(supabasePatch).length > 0) {
    try {
      await supabase
        .from("businesses")
        .update({ ...supabasePatch, updated_at: new Date().toISOString() })
        .eq("id", id);
    } catch (err) {
      console.warn("updateMerchant: Supabase indisponível.", err);
    }
  }
  return getMerchants();
}

export async function addMerchant(
  data: Omit<MerchantRecord, "id" | "joinedAt">,
): Promise<MerchantRecord[]> {
  const now = new Date().toISOString();
  const newId = crypto.randomUUID();
  if (SUPABASE_CONFIGURED && supabase) {
    try {
      await supabase.from("businesses").insert({
        id: newId,
        owner_id: newId, // admin-criado, sem owner real
        business_name: data.businessName,
        owner_name: data.ownerName,
        category: data.category,
        city: data.city,
        country: "Moçambique",
        phone: data.phone,
        email: data.email,
        plan_id: data.planId,
        plan_status: data.status,
        plan_renews_at: data.renewsAt,
        payment_method: data.paymentMethod,
        notes: data.notes,
        created_at: now,
        updated_at: now,
      });
    } catch (err) {
      console.warn("addMerchant: Supabase indisponível.", err);
    }
  }
  return getMerchants();
}

export async function deleteMerchant(id: string): Promise<MerchantRecord[]> {
  const merchants = await getMerchants();
  const m = merchants.find((x) => x.id === id);
  if (SUPABASE_CONFIGURED && supabase) {
    try {
      await supabase.from("businesses").delete().eq("id", id);
    } catch (err) {
      console.warn("deleteMerchant: Supabase indisponível.", err);
    }
  }
  return getMerchants();
}


// ── CONSTANTES ────────────────────────────────────────────────────────
export const PLAN_LABELS: Record<string, string> = {
  free: "Free",
  starter: "Starter",
  pro: "Pro",
  premium: "Premium",
};
export const PLAN_PRICES: Record<string, number> = {
  free: 0,
  starter: 300,
  pro: 500,
  premium: 900,
};
export const STATUS_LABELS: Record<string, string> = {
  active: "Activo",
  trial: "Trial",
  overdue: "Em atraso",
  blocked: "Bloqueado",
};
export const CATEGORY_LABELS: Record<string, string> = {
  food: "Restaurante",
  bar: "Bar",
  hotel: "Hotel",
  shop: "Loja",
  service: "Serviço",
  health: "Saúde",
  education: "Educação",
  entertainment: "Entretenimento",
};


// ── CONFIGURAÇÃO DE PAGAMENTOS — Supabase ────────────────────────────
export interface PaymentConfig {
  mpesa: string;
  emola: string;
  mpesaName: string;
  emolaName: string;
  updatedAt: string;
}

const DEFAULT_PAYMENT_CONFIG: PaymentConfig = {
  mpesa: "",
  emola: "",
  mpesaName: "XTACK OFICIAL",
  emolaName: "XTACK OFICIAL",
  updatedAt: new Date().toISOString(),
};

export async function getPaymentConfig(): Promise<PaymentConfig> {
  if (SUPABASE_CONFIGURED && supabase) {
    try {
      const { data, error } = await supabase
        .from("admin_settings")
        .select("value")
        .eq("key", "payment_config")
        .single();
      if (!error && data?.value)
        return { ...DEFAULT_PAYMENT_CONFIG, ...(data.value as Partial<PaymentConfig>) };
    } catch {
      /* fallback */
    }
  }
  try {
    const raw = localStorage.getItem("xlocal.admin.payment_config.v1");
    if (raw) return { ...DEFAULT_PAYMENT_CONFIG, ...JSON.parse(raw) };
  } catch {
    /* ignorado */
  }
  return DEFAULT_PAYMENT_CONFIG;
}

export async function savePaymentConfig(config: Partial<PaymentConfig>): Promise<PaymentConfig> {
  const current = await getPaymentConfig();
  const updated: PaymentConfig = { ...current, ...config, updatedAt: new Date().toISOString() };
  if (SUPABASE_CONFIGURED && supabase) {
    try {
      await supabase
        .from("admin_settings")
        .upsert({ key: "payment_config", value: updated, updated_at: updated.updatedAt });
      return updated;
    } catch {
      /* fallback */
    }
  }
  try {
    localStorage.setItem("xlocal.admin.payment_config.v1", JSON.stringify(updated));
  } catch {
    /* ignorado */
  }
  return updated;
}


// ── COMPROVATIVOS DE PAGAMENTO — Supabase ────────────────────────────
export interface PaymentProof {
  id: string;
  businessId?: string;
  businessName: string;
  method: "mpesa" | "emola";
  amount: number;
  plan: "starter" | "pro" | "premium" | "boost";
  boostPackageId?: "1d" | "7d" | "30d" | null;
  proofNote: string;
  status: "pending" | "confirmed" | "rejected";
  submittedAt: string;
  reviewedAt?: string;
}

function rowToProof(r: Record<string, unknown>): PaymentProof {
  return {
    id: r.id as string,
    businessId: r.business_id as string | undefined,
    businessName: (r.business_name as string) ?? "",
    method: (r.method as PaymentProof["method"]) ?? "mpesa",
    amount: (r.amount as number) ?? 0,
    plan: (r.plan as PaymentProof["plan"]) ?? "starter",
    boostPackageId: r.boost_package_id as PaymentProof["boostPackageId"],
    proofNote: (r.proof_note as string) ?? "",
    status: (r.status as PaymentProof["status"]) ?? "pending",
    submittedAt: (r.submitted_at as string) ?? new Date().toISOString(),
    reviewedAt: r.reviewed_at as string | undefined,
  };
}

export async function getPaymentProofs(): Promise<PaymentProof[]> {
  if (SUPABASE_CONFIGURED && supabase) {
    try {
      const { data, error } = await supabase
        .from("payment_proofs")
        .select("*")
        .order("submitted_at", { ascending: false });
      if (!error && data) return data.map((r) => rowToProof(r as Record<string, unknown>));
    } catch {
      /* fallback */
    }
  }
  try {
    const raw = localStorage.getItem("xlocal.admin.payment_proofs.v1");
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export async function addPaymentProof(
  proof: Omit<PaymentProof, "id" | "submittedAt" | "status">,
): Promise<PaymentProof> {
  const now = new Date().toISOString();
  const newProof: PaymentProof = {
    ...proof,
    id: `proof_${Date.now()}`,
    status: "pending",
    submittedAt: now,
  };
  if (SUPABASE_CONFIGURED && supabase) {
    try {
      await supabase.from("payment_proofs").insert({
        id: newProof.id,
        business_id: newProof.businessId ?? null,
        business_name: newProof.businessName,
        method: newProof.method,
        amount: newProof.amount,
        plan: newProof.plan,
        boost_package_id: newProof.boostPackageId ?? null,
        proof_note: newProof.proofNote,
        status: "pending",
        submitted_at: now,
      });
      return newProof;
    } catch {
      /* fallback */
    }
  }
  try {
    const raw = localStorage.getItem("xlocal.admin.payment_proofs.v1");
    const proofs: PaymentProof[] = raw ? JSON.parse(raw) : [];
    proofs.unshift(newProof);
    localStorage.setItem("xlocal.admin.payment_proofs.v1", JSON.stringify(proofs));
  } catch {
    /* ignorado */
  }
  return newProof;
}

// v24 — Permite acrescentar/editar a nota de um comprovativo DEPOIS de já
// ter sido criado. Usado quando o alerta ao admin é disparado assim que a
// pessoa clica "Já paguei" (proofNote ainda vazia nesse momento) e só
// depois, no passo seguinte, ela escreve a referência/nota — sem isto, a
// nota escrita a seguir nunca chegava a ser guardada, ficando sempre vazia
// no Supabase.
export async function updatePaymentProofNote(id: string, proofNote: string): Promise<void> {
  if (SUPABASE_CONFIGURED && supabase) {
    try {
      await supabase.from("payment_proofs").update({ proof_note: proofNote }).eq("id", id);
      return;
    } catch {
      /* fallback */
    }
  }
  try {
    const raw = localStorage.getItem("xlocal.admin.payment_proofs.v1");
    const proofs: PaymentProof[] = raw ? JSON.parse(raw) : [];
    const updated = proofs.map((p) => (p.id === id ? { ...p, proofNote } : p));
    localStorage.setItem("xlocal.admin.payment_proofs.v1", JSON.stringify(updated));
  } catch {
    /* ignorado */
  }
}

export async function reviewPaymentProof(
  id: string,
  status: "confirmed" | "rejected",
): Promise<PaymentProof[]> {
  const now = new Date().toISOString();
  if (SUPABASE_CONFIGURED && supabase) {
    try {
      await supabase.from("payment_proofs").update({ status, reviewed_at: now }).eq("id", id);
      return getPaymentProofs();
    } catch {
      /* fallback */
    }
  }
  try {
    const raw = localStorage.getItem("xlocal.admin.payment_proofs.v1");
    const proofs: PaymentProof[] = raw ? JSON.parse(raw) : [];
    const updated = proofs.map((p) => (p.id === id ? { ...p, status, reviewedAt: now } : p));
    localStorage.setItem("xlocal.admin.payment_proofs.v1", JSON.stringify(updated));
  } catch {
    /* ignorado */
  }
  return getPaymentProofs();
}

