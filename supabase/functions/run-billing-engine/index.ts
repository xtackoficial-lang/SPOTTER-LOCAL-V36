// ============================================================
// XTACK SPOTTER — Edge Function: run-billing-engine
// ------------------------------------------------------------
// Corre no servidor (Deno runtime do Supabase), invocada por um cron
// job (pg_cron, 1x/dia) ou manualmente pelo admin ("Correr agora").
// É a versão server-side de src/lib/billing-engine.ts — mesma lógica
// de negócio (trial → overdue → blocked), mas correndo sozinha no
// Supabase em vez de depender de alguém abrir o /admin no browser.
//
// Responsabilidades:
//   1. Ler todos os comerciantes (exceto plano Free, que é permanente).
//   2. Para cada um, avançar o estado conforme os dias até renovação:
//      trial a terminar → aviso; trial expirado → overdue; overdue
//      há +5 dias → blocked.
//   3. Registar cada evento em billing_log (visível no /admin).
//
// Variáveis de ambiente necessárias (Supabase → Edge Functions → Secrets):
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (já existem por omissão)
// ============================================================

// @ts-nocheck — ambiente Deno (Supabase Edge Functions), tipos diferentes do projecto Vite/React.
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
// Conserto de segurança (item 9 da auditoria) — mesma lógica da
// send-scheduled-notifications: sem isto, qualquer pessoa com a anon
// key pública conseguia disparar o motor de cobrança à vontade.
const FUNCTION_SECRET = Deno.env.get("FUNCTION_SECRET")!;
// Injectada automaticamente pelo runtime das Edge Functions do
// Supabase — não precisa de ser configurada à mão.
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

// Autoriza duas origens de chamada:
//  1) pg_cron / servidor-a-servidor — manda o FUNCTION_SECRET fixo.
//  2) botão "Correr agora" no /admin — manda a sessão do próprio
//     admin autenticado; confirma-se que está na tabela admins.
async function isAuthorized(req: Request): Promise<boolean> {
  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  if (!token) return false;
  if (token === FUNCTION_SECRET) return true;

  try {
    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user) return false;
    const { data: adminRow } = await supabase
      .from("admins")
      .select("id")
      .eq("id", userData.user.id)
      .maybeSingle();
    return !!adminRow;
  } catch {
    return false;
  }
}

const PLAN_PRICES: Record<string, number> = {
  free: 0,
  starter: 300,
  pro: 500,
  premium: 900,
};

function daysUntil(iso: string): number {
  return Math.ceil((new Date(iso).getTime() - Date.now()) / 86400000);
}

async function logEvent(
  merchantId: string,
  businessName: string,
  event: string,
  message: string,
  daysUntilAction: number,
) {
  // Evita duplicar o mesmo evento para o mesmo comerciante no mesmo dia
  // (o cron pode correr mais de uma vez, ou seres tu a clicar "correr
  // agora" pouco depois do cron já ter corrido).
  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);

  const { data: existing } = await supabase
    .from("billing_log")
    .select("id")
    .eq("merchant_id", merchantId)
    .eq("event", event)
    .gte("created_at", todayStart.toISOString())
    .limit(1);

  if (existing && existing.length > 0) return;

  await supabase.from("billing_log").insert({
    merchant_id: merchantId,
    business_name: businessName,
    event,
    message,
    days_until_action: daysUntilAction,
  });
}

async function runBillingEngine() {
  const { data: merchants, error } = await supabase
    .from("businesses")
    .select("id, business_name, plan_id, plan_status, plan_renews_at, notes");

  if (error) throw error;

  let processed = 0;
  let blocked = 0;
  let notified = 0;

  for (const m of merchants ?? []) {
    processed++;

    // O plano Free é permanente e não entra no ciclo de cobrança.
    if (m.plan_id === "free") continue;

    const days = daysUntil(m.plan_renews_at);
    const price = PLAN_PRICES[m.plan_id] ?? 0;

    // ── Trial a terminar (≤3 dias)
    if (m.plan_status === "trial" && days <= 3 && days > 0) {
      await logEvent(
        m.id,
        m.business_name,
        "trial_ending",
        `Trial de "${m.business_name}" termina em ${days} dia${days !== 1 ? "s" : ""}. Activar plano para evitar interrupção.`,
        days,
      );
      notified++;
    }

    // ── Trial expirado → overdue
    if (m.plan_status === "trial" && days <= 0) {
      await supabase.from("businesses").update({ plan_status: "overdue" }).eq("id", m.id);
      await logEvent(
        m.id,
        m.business_name,
        "trial_expired",
        `Trial de "${m.business_name}" expirou. Conta em modo overdue.`,
        0,
      );
      notified++;
    }

    // ── Renovação em ≤2 dias
    if (m.plan_status === "active" && days <= 2 && days >= 0) {
      await logEvent(
        m.id,
        m.business_name,
        "payment_due",
        `Renovação de "${m.business_name}" (${price} MZN) prevista em ${days} dia${days !== 1 ? "s" : ""}.`,
        days,
      );
      notified++;
    }

    // ── Overdue → sem pagamento em 5 dias → bloquear
    if (m.plan_status === "overdue") {
      await logEvent(
        m.id,
        m.business_name,
        "payment_overdue",
        `"${m.business_name}" está em atraso há ${Math.abs(days)} dias. Cobrança pendente: ${price} MZN.`,
        days,
      );
      notified++;

      if (days < -5) {
        await supabase
          .from("businesses")
          .update({
            plan_status: "blocked",
            notes:
              (m.notes ? m.notes + " | " : "") +
              `Auto-bloqueado em ${new Date().toLocaleDateString("pt-MZ")}`,
          })
          .eq("id", m.id);
        await logEvent(
          m.id,
          m.business_name,
          "auto_blocked",
          `"${m.business_name}" foi bloqueado automaticamente por falta de pagamento (${Math.abs(days)} dias em atraso).`,
          0,
        );
        blocked++;
      }
    }
  }

  return { processed, blocked, notified };
}

Deno.serve(async (req: Request) => {
  try {
    if (!(await isAuthorized(req))) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    const result = await runBillingEngine();
    return new Response(JSON.stringify(result), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("run-billing-engine: erro", err); // fica só no log do Supabase
    return new Response(JSON.stringify({ error: "internal_error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
