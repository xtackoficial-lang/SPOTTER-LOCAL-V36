// ============================================================
// SPOTTER — Turbinar / Destacar negócio ("Boost")
// ------------------------------------------------------------
// Pagamento único (M-Pesa/e-Mola/manual) para o negócio aparecer
// no topo das listagens. O comerciante escolhe um pacote — 1 dia,
// 7 dias ou 30 dias — pago de forma linear (preço/dia × dias).
//
// Expiração: o pacote de 1 dia expira à meia-noite (CAT) seguinte
// à aprovação, como antes. Os pacotes de 7/30 dias expiram à
// meia-noite (CAT) N dias depois da aprovação (mesma janela das
// 00:00, só que mais à frente no tempo).
//
// Ordenação no topo: pacotes mais longos têm prioridade sobre os
// mais curtos (30 dias > 7 dias > 1 dia). Dentro do mesmo pacote,
// quem activou primeiro aparece primeiro (critério de desempate).
//
// Fluxo (reaproveita o mesmo padrão híbrido Supabase + localStorage
// já usado pelos planos starter/pro/premium em payment.tsx):
//   comerciante escolhe pacote → cria pedido em "payments" (plan_id:
//   "boost") + comprovativo na fila local do admin → admin aprova
//   (reviewPaymentProof) → activateBoost() cria a linha em
//   business_boosts com expires_at calculado a partir do pacote.
// ============================================================

import { supabase, SUPABASE_CONFIGURED } from "./supabase";
import { t } from "./i18n";

export const BOOST_PRICE_PER_DAY_MZN = 60;

export type BoostPackageId = "1d" | "7d" | "30d";

export interface BoostPackage {
  id: BoostPackageId;
  days: number;
  label: string;
  description: string;
}

// Preço linear, sem desconto — dias × preço/dia.
export const BOOST_PACKAGES: BoostPackage[] = [
  { id: "1d", days: 1, label: t("boostPackage1d"), description: t("boostDesc1d") },
  { id: "7d", days: 7, label: t("boostPackage7d"), description: t("boostDesc7d") },
  { id: "30d", days: 30, label: t("boostPackage30d"), description: t("boostDesc30d") },
];

export function getBoostPackage(id: BoostPackageId): BoostPackage {
  return BOOST_PACKAGES.find((p) => p.id === id) ?? BOOST_PACKAGES[0];
}

export function boostPackagePrice(id: BoostPackageId): number {
  return getBoostPackage(id).days * BOOST_PRICE_PER_DAY_MZN;
}

export interface BusinessBoost {
  id: string;
  businessId: string;
  paymentId?: string | null;
  packageId: BoostPackageId;
  durationDays: number;
  activatedAt: string;
  expiresAt: string;
}

const LOCAL_KEY = "xlocal.business_boosts.v2";

function localRead(): BusinessBoost[] {
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}
function localWrite(data: BusinessBoost[]) {
  try {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(data));
  } catch {
    /* ignorado: falha de quota/acesso ao localStorage */
  }
}

// ── Meia-noite (CAT, UTC+2) N dias depois de "from" ─────────
// N=1 dá a meia-noite seguinte (comportamento original do pacote de 1 dia);
// N=7/30 empurra a mesma janela das 00:00 mais para a frente.
function midnightCATAfterDays(from: Date, days: number): Date {
  const CAT_OFFSET_MIN = 120;
  const catNow = new Date(from.getTime() + CAT_OFFSET_MIN * 60 * 1000);
  const targetDayCAT = new Date(
    Date.UTC(catNow.getUTCFullYear(), catNow.getUTCMonth(), catNow.getUTCDate() + days, 0, 0, 0),
  );
  return new Date(targetDayCAT.getTime() - CAT_OFFSET_MIN * 60 * 1000);
}

// ── Activar um boost (chamado pelo admin ao aprovar o comprovativo) ──
export async function activateBoost(
  businessId: string,
  packageId: BoostPackageId,
  paymentId?: string,
): Promise<BusinessBoost> {
  const now = new Date();
  const pkg = getBoostPackage(packageId);
  const boost: BusinessBoost = {
    id: crypto.randomUUID(),
    businessId,
    paymentId: paymentId ?? null,
    packageId: pkg.id,
    durationDays: pkg.days,
    activatedAt: now.toISOString(),
    expiresAt: midnightCATAfterDays(now, pkg.days).toISOString(),
  };

  if (SUPABASE_CONFIGURED && supabase) {
    try {
      const { error } = await supabase.from("business_boosts").insert({
        id: boost.id,
        business_id: boost.businessId,
        payment_id: boost.paymentId,
        package_id: boost.packageId,
        duration_days: boost.durationDays,
        activated_at: boost.activatedAt,
        expires_at: boost.expiresAt,
      });
      if (error) console.warn("activateBoost: Supabase insert falhou:", error.message);
    } catch (err) {
      console.warn("activateBoost: Supabase indisponível, a continuar apenas localmente.", err);
    }
  }

  const all = [...localRead(), boost];
  localWrite(all);
  return boost;
}

// ── Boosts activos agora, por ordem de prioridade ────────────────────
// (pacote mais longo primeiro; dentro do mesmo pacote, quem activou
// primeiro aparece primeiro — mesma lógica usada para ordenar a lista)
async function getActiveBoosts(): Promise<BusinessBoost[]> {
  const now = new Date();

  if (SUPABASE_CONFIGURED && supabase) {
    try {
      const { data, error } = await supabase
        .from("business_boosts")
        .select("id, business_id, payment_id, package_id, duration_days, activated_at, expires_at")
        .gt("expires_at", now.toISOString())
        .order("activated_at", { ascending: true });
      if (!error && data) {
        return (
          data as {
            id: string;
            business_id: string;
            payment_id: string | null;
            package_id: BoostPackageId;
            duration_days: number;
            activated_at: string;
            expires_at: string;
          }[]
        ).map((row) => ({
          id: row.id,
          businessId: row.business_id,
          paymentId: row.payment_id,
          packageId: row.package_id,
          durationDays: row.duration_days,
          activatedAt: row.activated_at,
          expiresAt: row.expires_at,
        }));
      }
    } catch (err) {
      console.warn("getActiveBoosts: Supabase indisponível, a usar dados locais.", err);
    }
  }

  return localRead()
    .filter((b) => new Date(b.expiresAt) > now)
    .sort((a, b) => a.activatedAt.localeCompare(b.activatedAt));
}

// ── IDs de negócios com boost activo agora, já ordenados por prioridade ──
// (pacote mais longo primeiro; empate resolvido por quem activou primeiro)
export async function getActiveBoostedBusinessIds(): Promise<string[]> {
  const boosts = await getActiveBoosts();
  // Mantém só o boost de maior prioridade por negócio, caso tenha mais
  // do que um activo em simultâneo (ex: comprou 1 dia e depois 30 dias).
  const bestByBusiness = new Map<string, BusinessBoost>();
  for (const b of boosts) {
    const current = bestByBusiness.get(b.businessId);
    if (!current || b.durationDays > current.durationDays) {
      bestByBusiness.set(b.businessId, b);
    }
  }
  return [...bestByBusiness.values()]
    .sort((a, b) => {
      if (b.durationDays !== a.durationDays) return b.durationDays - a.durationDays;
      return a.activatedAt.localeCompare(b.activatedAt);
    })
    .map((b) => b.businessId);
}

// ── Boost activo (se algum) de um negócio específico ──────────────────
// Antes só existia isBusinessBoosted(), que devolvia um simples
// true/false e nunca chegou a ser usada em lado nenhum — o painel do
// comerciante (business.tsx) sempre mostrava "Turbinar negócio · desde
// 60 MZN/dia" como convite a comprar, mesmo quando o negócio já tinha um
// destaque activo, sem indicar quanto tempo restava. Devolver o boost
// completo permite mostrar isso.
export async function getActiveBoostForBusiness(businessId: string): Promise<BusinessBoost | null> {
  const boosts = await getActiveBoosts();
  return boosts.find((b) => b.businessId === businessId) ?? null;
}

// ── Reordena uma lista de negócios colocando os turbinados primeiro ──
// (a ordem recebida em boostedIds já reflecte a prioridade correta —
// pacote mais longo primeiro — por isso aqui só se preserva essa ordem.
// Mantém a ordenação original — distância, rating, etc. — dentro do
// resto da lista, depois dos turbinados.)
export function applyBoostOrder<T extends { id: string }>(items: T[], boostedIds: string[]): T[] {
  if (boostedIds.length === 0) return items;
  const boostedSet = new Set(boostedIds);
  const boostRank = new Map(boostedIds.map((id, i) => [id, i]));
  const boosted = items
    .filter((i) => boostedSet.has(i.id))
    .sort((a, b) => (boostRank.get(a.id) ?? 0) - (boostRank.get(b.id) ?? 0));
  const rest = items.filter((i) => !boostedSet.has(i.id));
  return [...boosted, ...rest];
}
