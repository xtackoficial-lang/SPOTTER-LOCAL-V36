// Sistema de Mensalidade — Comerciantes
import { useEffect, useState } from "react";
import { supabase, SUPABASE_CONFIGURED } from "./supabase";

// "free" é um plano real e permanente (não expira, não entra no ciclo
// de cobrança trial→overdue→blocked) — ver FREE_PLAN abaixo.
export type PlanId = "free" | "starter" | "pro" | "premium";
export type PaidPlanId = "starter" | "pro" | "premium";
export type PlanStatus = "active" | "trial" | "overdue" | "blocked";

export interface Plan {
  id: PlanId;
  name: string;
  price: number; // MZN/mês (0 para o Free)
  currency: "MZN";
  features: string[];
  maxProducts: number;
  highlight?: boolean;
  hasGallery: boolean;
  galleryLimit: number;
  hasChat: boolean; // Free recebe mensagens mas não pode responder
  hasAnalytics: boolean; // Free não tem analytics do negócio
  hasFeaturedPin: boolean; // localização destacada no mapa
  hasCompanySupport: boolean;
  hasVerifiedBadge: boolean;
  // Estruturas & Temas de perfil (ver src/lib/profile-styles.ts).
  // maxStructures: quantas estruturas da família do negócio o
  // comerciante pode escolher (Free fica só com as 2 básicas, sem
  // cardápio/blocos avançados — pedido explícito do Abrão).
  maxStructures: number;
  // hasMultiCategory: pode activar mais de uma categoria no mesmo
  // negócio (ex: Hotel + Restaurante) e ter estrutura própria para
  // cada uma. Só nos planos pagos.
  hasMultiCategory: boolean;
  // themeSwapsPerMonth: quantas vezes por mês pode trocar de
  // Estrutura/Tema — benefício incluído no plano, não é compra avulsa.
  themeSwapsPerMonth: number;
}

// Plano gratuito — para sempre, sem mensalidade. Limites reais que
// criam necessidade de upgrade: 2 fotos, 3 produtos, sem chat, sem
// analytics, sem destaque no mapa, sem selo. Aparece nas listas como
// qualquer outro negócio, só sem prioridade nem chat.
export const FREE_PLAN: Plan = {
  id: "free",
  name: "Free",
  price: 0,
  currency: "MZN",
  maxProducts: 3,
  hasGallery: true,
  galleryLimit: 2,
  hasChat: false,
  hasAnalytics: false,
  hasFeaturedPin: false,
  hasCompanySupport: false,
  hasVerifiedBadge: false,
  maxStructures: 2,
  hasMultiCategory: false,
  themeSwapsPerMonth: 1,
  features: [
    "featFreeProfile",
    "featFreeMessages",
    "featFreePhotos",
    "featFreeProducts",
    "featFreeStructures",
  ],
};

export const PLANS: (Omit<Plan, "id"> & { id: PaidPlanId })[] = [
  {
    id: "starter",
    name: "Starter",
    price: 300,
    currency: "MZN",
    maxProducts: 8,
    hasGallery: true,
    galleryLimit: 6,
    hasChat: true,
    hasAnalytics: false,
    hasFeaturedPin: true,
    hasCompanySupport: false,
    hasVerifiedBadge: false,
    maxStructures: 4,
    hasMultiCategory: true,
    themeSwapsPerMonth: 2,
    features: [
      "featStarterAll",
      "featStarterReply",
      "featStarterGallery",
      "featStarterCatalog10",
      "featStarterFeaturedPin",
      "featStarterWebsite",
      "featStarterStructures4",
      "featStarterMultiCategory",
    ],
  },
  {
    id: "pro",
    name: "Pro",
    price: 500,
    currency: "MZN",
    maxProducts: 14,
    highlight: true,
    hasGallery: true,
    galleryLimit: 10,
    hasChat: true,
    hasAnalytics: true,
    hasFeaturedPin: true,
    hasCompanySupport: false,
    hasVerifiedBadge: false,
    maxStructures: 5,
    hasMultiCategory: true,
    themeSwapsPerMonth: 3,
    features: [
      "featProAll",
      "featProGallery20",
      "featProCatalog50",
      "featProAnalytics",
      "featProRanking",
      "featProStructures5",
    ],
  },
  {
    id: "premium",
    name: "Premium",
    price: 900,
    currency: "MZN",
    maxProducts: 20,
    hasGallery: true,
    galleryLimit: 15,
    hasChat: true,
    hasAnalytics: true,
    hasFeaturedPin: true,
    hasCompanySupport: true,
    hasVerifiedBadge: true,
    maxStructures: 6,
    hasMultiCategory: true,
    themeSwapsPerMonth: 4,
    features: [
      "featPremiumAll",
      "featPremiumGallery40",
      "featPremiumCatalogUnlimited",
      "featPremiumSupport",
      "featPremiumVerifiedBadge",
      "featPremiumTopRanking",
      "featPremiumStructures6",
    ],
  },
];

// Todos os planos, incluindo o Free — útil para procurar um plano por
// id sem ter de lembrar que o Free vive numa constante separada.
export const ALL_PLANS: Plan[] = [FREE_PLAN, ...PLANS];

export function getPlanById(id: PlanId): Plan {
  return ALL_PLANS.find((p) => p.id === id) ?? FREE_PLAN;
}

export interface Subscription {
  planId: PlanId;
  status: PlanStatus;
  startedAt: string;
  renewsAt: string;
  paymentMethod: "mpesa" | "emola" | "manual" | null;
  lastPaymentAt?: string;
}

const KEY = "xlocal.subscription.v1";

// Novo comerciante entra directamente no Free — permanente, sem
// trial e sem ciclo de cobrança. Não há período de teste: para usar
// um plano pago, o comerciante paga directamente em /payment.
function makeFreeSub(): Subscription {
  const now = new Date();
  return {
    planId: "free",
    status: "active",
    startedAt: now.toISOString(),
    renewsAt: now.toISOString(), // Free não renova — campo sem efeito aqui
    paymentMethod: null,
  };
}

function read(): Subscription | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
function write(s: Subscription) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* ignorado: falha de quota/acesso ao localStorage */
  }
}

// Função standalone (fora de componentes React) para activar a assinatura
// após confirmação real de pagamento — usada tanto pelo hook useSubscription
// quanto pelo fluxo de comprovativo em /payment, para que ambos escrevam
// na MESMA fonte de verdade e o painel reflicta a activação imediatamente.
export function activateSubscription(
  planId: PaidPlanId,
  method: Subscription["paymentMethod"],
): Subscription {
  const now = new Date();
  const renewsAt = new Date(now);
  renewsAt.setMonth(renewsAt.getMonth() + 1);
  const next: Subscription = {
    planId,
    status: "active",
    startedAt: now.toISOString(),
    renewsAt: renewsAt.toISOString(),
    paymentMethod: method,
    lastPaymentAt: now.toISOString(),
  };
  write(next);
  return next;
}

// Permite voltar ao Free (downgrade voluntário, ou quando um plano
// pago é cancelado). Fotos/produtos acima do limite do Free não são
// apagados — ficam ocultos até voltar a fazer upgrade (ver galleryLimit
// em merchant.tsx e maxProducts em products.tsx, que já só mostram/
// permitem editar os primeiros N itens dentro do limite do plano activo).
export function downgradeToFree(): Subscription {
  const next = makeFreeSub();
  write(next);
  return next;
}

// Sincroniza o estado local de assinatura com o Supabase quando o negócio
// já tem id (businessId) e o Supabase está configurado. Sem isto, quando o
// admin confirma um pagamento no painel (noutro dispositivo), a app do
// comerciante só reflectia o plano novo manualmente em modo Demo — o plano
// real activado no Supabase ficava invisível para sempre na app dele.
export function useSubscription(businessId?: string) {
  const [sub, setSub] = useState<Subscription | null>(null);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    let s = read();
    if (!s) {
      s = makeFreeSub();
      write(s);
    }
    // Compatibilidade com contas antigas que ainda tinham um trial em
    // curso (status "trial") de versões anteriores do app — passam a
    // Free directamente, já que o trial deixou de existir.
    if (s.status === "trial") {
      s = makeFreeSub();
      write(s);
    }
    // Check if overdue > 30 dias (quem já pagou antes e deixou de pagar)
    // → bloquear o plano pago, mas sem impedir o acesso básico de Free.
    if (s.status === "overdue" && s.renewsAt && new Date() > new Date(s.renewsAt)) {
      s = { ...s, status: "blocked" };
      write(s);
    }
    setSub(s);
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!businessId || !SUPABASE_CONFIGURED || !supabase) return;
    let cancelled = false;
    (async () => {
      try {
        const { data, error } = await supabase
          .from("businesses")
          .select("plan_id, plan_status, plan_renews_at, last_payment_at, payment_method")
          .eq("id", businessId)
          .maybeSingle();
        if (cancelled || error || !data) return;
        const local = read();
        // O estado remoto (definido pelo admin no painel: active, overdue
        // ou blocked) é sempre a fonte de verdade quando existe — sobrepõe
        // o estado local. Contas antigas com plan_status "trial" no
        // Supabase também caem para Free, já que o trial foi removido.
        const remoteStatus: PlanStatus =
          (data.plan_status as PlanStatus) === "trial"
            ? "active"
            : ((data.plan_status as PlanStatus) ?? "active");
        const remote: Subscription = {
          planId:
            remoteStatus === "active" && (data.plan_status as PlanStatus) === "trial"
              ? "free"
              : ((data.plan_id as PlanId) ?? "free"),
          status: remoteStatus,
          startedAt: local?.startedAt ?? new Date().toISOString(),
          renewsAt: data.plan_renews_at ?? local?.renewsAt ?? new Date().toISOString(),
          paymentMethod: (data.payment_method as Subscription["paymentMethod"]) ?? null,
          lastPaymentAt: data.last_payment_at ?? undefined,
        };
        write(remote);
        setSub(remote);
      } catch (err) {
        console.warn("useSubscription: falha ao sincronizar com Supabase.", err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [businessId]);

  const activate = (planId: PaidPlanId, method: Subscription["paymentMethod"]) => {
    const next = activateSubscription(planId, method);
    setSub(next);
  };

  const plan = getPlanById(sub?.planId ?? "free");
  const isFree = sub?.planId === "free";
  const isBlocked = sub?.status === "blocked";
  const isOverdue = sub?.status === "overdue";

  return {
    sub,
    hydrated,
    plan,
    activate,
    isFree,
    isBlocked,
    isOverdue,
  };
}
