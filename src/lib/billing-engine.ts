// ============================================================
// SPOTTER — Motor de cobrança recorrente
// Parte 3 — Bloqueio automático + notificações
// ============================================================

import { supabase, SUPABASE_CONFIGURED } from "./supabase";
import type { MerchantRecord } from "./shop-data";
import { getMerchants, updateMerchant, PLAN_PRICES } from "./shop-data";

export type BillingEvent =
  | "trial_ending" // trial com ≤3 dias
  | "trial_expired" // trial terminou
  | "payment_due" // renovação hoje ou amanhã
  | "payment_overdue" // pagamento em atraso
  | "auto_blocked" // bloqueado automaticamente
  | "plan_renewed"; // plano renovado com sucesso

export interface BillingNotification {
  id: string;
  merchantId: string;
  businessName: string;
  event: BillingEvent;
  message: string;
  daysUntilAction: number;
  createdAt: string;
  read: boolean;
}

// v23 — As notificações passaram a viver na tabela billing_log do
// Supabase (escritas pela Edge Function run-billing-engine, que corre
// sozinha via cron 1x/dia). "read" continua só local — é um detalhe de
// UI de cada sessão do admin, não precisa de sincronizar entre
// dispositivos, por isso mantém-se em localStorage por cima do que
// vem do servidor.
const READ_KEY = "xlocal.billing.read_ids.v1";

function readReadIds(): Set<string> {
  try {
    const raw = localStorage.getItem(READ_KEY);
    return new Set(raw ? JSON.parse(raw) : []);
  } catch {
    return new Set();
  }
}
function writeReadIds(ids: Set<string>) {
  try {
    localStorage.setItem(READ_KEY, JSON.stringify([...ids]));
  } catch {
    /* ignorado */
  }
}

function addNotif(_n: Omit<BillingNotification, "id" | "createdAt" | "read">) {
  // v23 — mantido como no-op para não quebrar chamadas existentes
  // (ex: activatePlanAfterPayment). Os eventos automáticos do motor de
  // cobrança já não passam por aqui — são escritos directamente em
  // billing_log pela Edge Function. Isto só continua a existir para o
  // evento "plan_renewed", disparado no momento em que o próprio admin
  // confirma um pagamento manualmente (ver activatePlanAfterPayment).
}

export async function getNotifications(): Promise<BillingNotification[]> {
  if (!SUPABASE_CONFIGURED || !supabase) return [];
  try {
    const { data, error } = await supabase
      .from("billing_log")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(100);
    if (error || !data) return [];
    const readIds = readReadIds();
    return data.map((r) => ({
      id: r.id as string,
      merchantId: r.merchant_id as string,
      businessName: r.business_name as string,
      event: r.event as BillingEvent,
      message: r.message as string,
      daysUntilAction: (r.days_until_action as number) ?? 0,
      createdAt: r.created_at as string,
      read: readIds.has(r.id as string),
    }));
  } catch (err) {
    console.warn("getNotifications: Supabase indisponível.", err);
    return [];
  }
}
export function markNotifRead(id: string) {
  const ids = readReadIds();
  ids.add(id);
  writeReadIds(ids);
}
export async function markAllRead() {
  const notifs = await getNotifications();
  const ids = readReadIds();
  for (const n of notifs) ids.add(n.id);
  writeReadIds(ids);
}
export async function getUnreadCount(): Promise<number> {
  const notifs = await getNotifications();
  return notifs.filter((n) => !n.read).length;
}

// ── Motor principal ───────────────────────────────────────────
// v23 — Passou a correr automaticamente no servidor via Edge Function
// (agendada por cron 1x/dia — ver SUPABASE_SETUP.sql bloco v23).
// Este botão em /admin ("Correr agora") deixou de fazer o trabalho
// aqui no browser: agora só invoca a mesma Edge Function sob pedido,
// para quem quiser forçar uma verificação imediata sem esperar pelo
// cron. Resultado idêntico, execução no mesmo sítio (servidor).
export async function runBillingEngine(): Promise<{
  processed: number;
  blocked: number;
  notified: number;
}> {
  if (!SUPABASE_CONFIGURED || !supabase) {
    return { processed: 0, blocked: 0, notified: 0 };
  }
  try {
    const { data, error } = await supabase.functions.invoke("run-billing-engine", {
      method: "POST",
    });
    if (error) throw error;
    return {
      processed: data?.processed ?? 0,
      blocked: data?.blocked ?? 0,
      notified: data?.notified ?? 0,
    };
  } catch (err) {
    console.warn("runBillingEngine: falha ao invocar a Edge Function.", err);
    return { processed: 0, blocked: 0, notified: 0 };
  }
}

// ── Activar plano após pagamento confirmado ──────────────────
export async function activatePlanAfterPayment(
  merchantId: string,
  planId: "starter" | "pro" | "premium",
  paymentRef: string,
  knownBusinessName?: string,
): Promise<MerchantRecord[]> {
  const now = new Date();
  const renewsAt = new Date(now);
  renewsAt.setMonth(renewsAt.getMonth() + 1);

  const updated = await updateMerchant(merchantId, {
    planId,
    status: "active",
    lastPaymentAt: now.toISOString(),
    renewsAt: renewsAt.toISOString(),
    notes: undefined,
  });

  addNotif({
    merchantId,
    // Para negócios reais (cadastrados via app, não fazem parte da lista
    // local de demonstração de comerciantes) updated.find() não encontra
    // nada — sem knownBusinessName, a notificação mostrava o UUID em vez
    // do nome do negócio.
    businessName:
      knownBusinessName ?? updated.find((m) => m.id === merchantId)?.businessName ?? merchantId,
    event: "plan_renewed",
    message: `Plano ${planId} activado com sucesso. Próxima cobrança: ${renewsAt.toLocaleDateString("pt-MZ")}.`,
    daysUntilAction: 30,
  });

  if (SUPABASE_CONFIGURED && supabase) {
    try {
      await supabase
        .from("businesses")
        .update({
          plan_id: planId,
          plan_status: "active",
          plan_renews_at: renewsAt.toISOString(),
          last_payment_at: now.toISOString(),
        })
        .eq("id", merchantId);
    } catch (err) {
      // O plano já foi activado localmente acima — uma falha aqui é só de
      // sincronização e não deve aparecer como erro de pagamento ao utilizador.
      console.warn("activatePlanAfterPayment: falha ao sincronizar com Supabase.", err);
    }
  }

  return updated;
}

// ── Estatísticas de billing para admin ──────────────────────
export interface BillingStats {
  mrr: number; // receita mensal recorrente (MZN)
  arr: number; // receita anual estimada
  activeCount: number;
  trialCount: number;
  overdueCount: number;
  blockedCount: number;
  overdueRevenue: number; // receita em risco
  conversionRate: number; // % trial → active
  avgPlanValue: number;
  planBreakdown: Record<string, { count: number; revenue: number }>;
}

export async function computeBillingStats(): Promise<BillingStats> {
  const merchants = await getMerchants();
  let mrr = 0;
  let activeCount = 0;
  let trialCount = 0;
  let overdueCount = 0;
  let blockedCount = 0;
  let overdueRevenue = 0;
  let totalTrialAndActive = 0;
  const planBreakdown: Record<string, { count: number; revenue: number }> = {
    starter: { count: 0, revenue: 0 },
    pro: { count: 0, revenue: 0 },
    premium: { count: 0, revenue: 0 },
  };

  for (const m of merchants) {
    const price = PLAN_PRICES[m.planId] ?? 0;
    planBreakdown[m.planId] = planBreakdown[m.planId] ?? { count: 0, revenue: 0 };
    planBreakdown[m.planId].count++;

    if (m.status === "active") {
      mrr += price;
      activeCount++;
      planBreakdown[m.planId].revenue += price;
      totalTrialAndActive++;
    } else if (m.status === "trial") {
      trialCount++;
      totalTrialAndActive++;
    } else if (m.status === "overdue") {
      overdueCount++;
      overdueRevenue += price;
    } else if (m.status === "blocked") {
      blockedCount++;
    }
  }

  const conversionRate =
    totalTrialAndActive > 0 ? Math.round((activeCount / totalTrialAndActive) * 100) : 0;

  return {
    mrr,
    arr: mrr * 12,
    activeCount,
    trialCount,
    overdueCount,
    blockedCount,
    overdueRevenue,
    conversionRate,
    avgPlanValue: activeCount > 0 ? Math.round(mrr / activeCount) : 0,
    planBreakdown,
  };
}
