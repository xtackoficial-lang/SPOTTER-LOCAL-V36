// ============================================================
// XTACK SPOTTER — Edge Function: create-zumbopay-payment
// ------------------------------------------------------------
// Chamada pelo cliente (src/lib/payments-db.ts → createZumboPayPayment)
// quando o comerciante escolhe "ZumboPay" como método de pagamento
// no ecrã /payment. Só cobre assinaturas (starter/pro/premium) —
// reservas/pedidos ficam para uma fase posterior.
//
// O que faz:
//   1. Valida o plano e calcula o preço (fonte única: PLAN_PRICES).
//   2. Cria a linha em "payments" (status pending) — igual ao fluxo
//      manual existente, para tudo continuar visível em /admin.
//   3. Chama a API da ZumboPay para gerar um Payment Link.
//   4. Grava a referência/URL devolvidas e devolve o link ao cliente.
//
// Variáveis de ambiente necessárias (Supabase → Edge Functions → Secrets):
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (já existem por omissão)
//   ZUMBOPAY_API_KEY        — chave secreta da ZumboPay (nunca no .env do Vite)
//   ZUMBOPAY_MERCHANT_ID    — ex: MCH_543CDD49F2
//   ZUMBOPAY_WEBHOOK_URL    — URL pública desta function:
//                             https://<project-ref>.supabase.co/functions/v1/zumbopay-webhook
//
// AJUSTAR CONFORME A DOCUMENTAÇÃO OFICIAL DA ZUMBOPAY:
//   - o endpoint exacto (assume-se POST /v1/payments)
//   - os nomes dos campos do payload (amount/reference/webhook_url)
//   - o formato da resposta (assume-se { id, payment_url })
// ============================================================

// @ts-nocheck — ambiente Deno (Supabase Edge Functions).
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ZUMBOPAY_API_KEY = Deno.env.get("ZUMBOPAY_API_KEY")!;
const ZUMBOPAY_MERCHANT_ID = Deno.env.get("ZUMBOPAY_MERCHANT_ID")!;
const ZUMBOPAY_WEBHOOK_URL = Deno.env.get("ZUMBOPAY_WEBHOOK_URL") ?? "";
const ZUMBOPAY_BASE_URL = "https://api.zumbopay.com/v1"; // confirmar na doc oficial

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

const PLAN_PRICES: Record<string, number> = {
  starter: 300,
  pro: 500,
  premium: 900,
};

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/json",
};

function makeRef(businessId: string, planId: string): string {
  const ts = Date.now().toString(36).toUpperCase();
  const bid = businessId.slice(0, 6).toUpperCase();
  return `XL-${bid}-${planId.slice(0, 2).toUpperCase()}-${ts}`;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "method_not_allowed" }), {
      status: 405,
      headers: CORS_HEADERS,
    });
  }

  let body: { businessId?: string; planId?: string };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "corpo do pedido inválido (JSON esperado)" }), {
      status: 400,
      headers: CORS_HEADERS,
    });
  }

  const { businessId, planId } = body;

  try {
    if (!businessId || typeof businessId !== "string" || !planId || !PLAN_PRICES[planId]) {
      return new Response(JSON.stringify({ error: "businessId ou planId inválido" }), {
        status: 400,
        headers: CORS_HEADERS,
      });
    }

    const amount = PLAN_PRICES[planId];
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 10 * 60 * 1000); // 10 min, igual ao fluxo manual

    // Idempotência: se já existe um pedido "pending" via ZumboPay para
    // este negócio+plano criado há menos de 10 min (ainda não expirou),
    // reaproveita-o em vez de criar outro — evita clique duplo a gerar
    // dois Payment Links diferentes para a mesma assinatura.
    const { data: existing } = await supabase
      .from("payments")
      .select("*")
      .eq("business_id", businessId)
      .eq("plan_id", planId)
      .eq("method", "zumbopay")
      .eq("status", "pending")
      .gt("expires_at", now.toISOString())
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existing?.payment_url) {
      return new Response(
        JSON.stringify({
          paymentId: existing.id,
          merchantRef: existing.merchant_ref,
          amount: existing.amount,
          createdAt: existing.created_at,
          expiresAt: existing.expires_at,
          paymentUrl: existing.payment_url,
          reused: true,
        }),
        { headers: CORS_HEADERS },
      );
    }

    const merchantRef = makeRef(businessId, planId);

    // 1) Cria a linha em "payments" já como pending — mesma tabela do
    //    fluxo manual, para aparecer em /admin como qualquer outro pagamento.
    const { data: paymentRow, error: insertError } = await supabase
      .from("payments")
      .insert({
        business_id: businessId,
        merchant_ref: merchantRef,
        plan_id: planId,
        amount,
        currency: "MZN",
        method: "zumbopay",
        status: "pending",
        expires_at: expiresAt.toISOString(),
      })
      .select()
      .single();

    if (insertError || !paymentRow) {
      // Corrida entre dois cliques quase simultâneos pode colidir na
      // unique index de merchant_ref — não é um erro real, só significa
      // que o outro pedido "ganhou". Não falha o pedido do utilizador.
      if (insertError?.code === "23505") {
        return new Response(
          JSON.stringify({ error: "Já existe um pagamento em curso para este plano. Aguarda uns segundos e tenta novamente." }),
          { status: 409, headers: CORS_HEADERS },
        );
      }
      console.error("create-zumbopay-payment: falha ao criar linha payments", insertError);
      return new Response(JSON.stringify({ error: "Falha ao registar o pagamento" }), {
        status: 500,
        headers: CORS_HEADERS,
      });
    }

    // 2) Cria o Payment Link na ZumboPay
    const zumboRes = await fetch(`${ZUMBOPAY_BASE_URL}/payments`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${ZUMBOPAY_API_KEY}`,
        "X-Merchant-Id": ZUMBOPAY_MERCHANT_ID,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        amount,
        currency: "MZN",
        reference: merchantRef,
        description: `Spotter Local — Plano ${planId}`,
        webhook_url: ZUMBOPAY_WEBHOOK_URL || undefined,
      }),
    });

    if (!zumboRes.ok) {
      const errBody = await zumboRes.text();
      console.error("create-zumbopay-payment: ZumboPay respondeu erro", zumboRes.status, errBody);
      // Marca a linha como failed para não ficar "pending" órfã.
      await supabase
        .from("payments")
        .update({ status: "failed", fail_reason: `ZumboPay ${zumboRes.status}` })
        .eq("id", paymentRow.id);
      return new Response(JSON.stringify({ error: "Falha ao criar pagamento na ZumboPay" }), {
        status: 502,
        headers: CORS_HEADERS,
      });
    }

    const zumboData = await zumboRes.json();
    // AJUSTAR: nomes de campo assumidos (id / payment_url) — confirmar na doc.
    const paymentUrl = zumboData.payment_url ?? zumboData.url ?? zumboData.link;
    const zumbopayPaymentId = zumboData.id ?? zumboData.payment_id;

    // 3) Guarda a referência devolvida pela ZumboPay na mesma linha
    await supabase
      .from("payments")
      .update({
        zumbopay_reference: merchantRef,
        zumbopay_payment_id: zumbopayPaymentId ?? null,
        payment_url: paymentUrl ?? null,
      })
      .eq("id", paymentRow.id);

    return new Response(
      JSON.stringify({
        paymentId: paymentRow.id,
        merchantRef,
        amount,
        createdAt: paymentRow.created_at,
        expiresAt: expiresAt.toISOString(),
        paymentUrl,
      }),
      { headers: CORS_HEADERS },
    );
  } catch (err) {
    console.error("create-zumbopay-payment: erro inesperado", err);
    return new Response(JSON.stringify({ error: "internal_error" }), {
      status: 500,
      headers: CORS_HEADERS,
    });
  }
});
