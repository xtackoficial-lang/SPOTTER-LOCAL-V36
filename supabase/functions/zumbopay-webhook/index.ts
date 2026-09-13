// ============================================================
// XTACK SPOTTER — Edge Function: zumbopay-webhook
// ------------------------------------------------------------
// Endpoint público chamado PELA ZUMBOPAY (não pelo teu frontend) quando
// um pagamento muda de estado. Confirma automaticamente a assinatura,
// substituindo o passo manual de "admin confirma no /admin".
//
// URL a configurar no dashboard da ZumboPay (Developers → Webhooks):
//   https://<project-ref>.supabase.co/functions/v1/zumbopay-webhook
//
// Variáveis de ambiente necessárias:
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
//   ZUMBOPAY_WEBHOOK_SECRET — secret de assinatura HMAC (diferente da API key;
//                             a ZumboPay deve mostrar isto ao criar o webhook)
//
// AJUSTAR CONFORME A DOC OFICIAL:
//   - nome exacto do header de assinatura (assume-se "X-Zumbopay-Signature")
//   - algoritmo exacto (assume-se HMAC-SHA256 sobre o corpo em bruto)
//   - nomes dos campos do payload (assume-se { event, reference, status, id })
// ============================================================

// @ts-nocheck — ambiente Deno (Supabase Edge Functions).
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const WEBHOOK_SECRET = Deno.env.get("ZUMBOPAY_WEBHOOK_SECRET")!;

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

async function verificarAssinatura(rawBody: string, signatureHeader: string | null): Promise<boolean> {
  if (!signatureHeader || !WEBHOOK_SECRET) return false;

  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(WEBHOOK_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signatureBuffer = await crypto.subtle.sign("HMAC", key, encoder.encode(rawBody));
  const expected = Array.from(new Uint8Array(signatureBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  // Comparação em tempo constante
  if (expected.length !== signatureHeader.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) {
    diff |= expected.charCodeAt(i) ^ signatureHeader.charCodeAt(i);
  }
  return diff === 0;
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "method_not_allowed" }), { status: 405 });
  }

  try {
    const rawBody = await req.text();
    const signature = req.headers.get("x-zumbopay-signature"); // AJUSTAR nome real do header

    const valido = await verificarAssinatura(rawBody, signature);
    if (!valido) {
      console.warn("zumbopay-webhook: assinatura inválida — pedido rejeitado");
      return new Response(JSON.stringify({ error: "invalid_signature" }), { status: 401 });
    }

    let payload: any;
    try {
      payload = JSON.parse(rawBody);
    } catch {
      return new Response(JSON.stringify({ error: "corpo inválido (JSON esperado)" }), {
        status: 400,
      });
    }
    // AJUSTAR conforme o payload real da ZumboPay.
    const eventType: string | undefined = payload.event ?? payload.type;
    const reference: string | undefined = payload.reference ?? payload.data?.reference;
    const status: string | undefined = payload.status ?? payload.data?.status;
    const zumbopayPaymentId: string | undefined = payload.id ?? payload.data?.id;

    // Se a ZumboPay reutilizar o mesmo endpoint para outros produtos/eventos
    // (ex: payouts, refunds), ignora tudo o que não for confirmação de
    // pagamento — evita processar algo que não sabemos interpretar.
    if (eventType && !/payment/i.test(eventType)) {
      return new Response(JSON.stringify({ received: true, ignored: eventType }), { status: 200 });
    }

    if (!reference && !zumbopayPaymentId) {
      return new Response(JSON.stringify({ error: "reference/id em falta no payload" }), {
        status: 400,
      });
    }

    // Busca a transação correspondente — primeiro pela referência que
    // NÓS geramos (merchant_ref), com fallback para o id da ZumboPay
    // caso algum evento só traga o id deles.
    let payment;
    if (reference) {
      const { data } = await supabase
        .from("payments")
        .select("*")
        .eq("merchant_ref", reference)
        .maybeSingle();
      payment = data;
    }
    if (!payment && zumbopayPaymentId) {
      const { data } = await supabase
        .from("payments")
        .select("*")
        .eq("zumbopay_payment_id", zumbopayPaymentId)
        .maybeSingle();
      payment = data;
    }

    if (!payment) {
      console.warn("zumbopay-webhook: pagamento não encontrado", { reference, zumbopayPaymentId });
      // Responde 200 mesmo assim — evita que a ZumboPay fique a reenviar
      // um evento que nunca vamos conseguir associar.
      return new Response(JSON.stringify({ received: true, matched: false }), { status: 200 });
    }

    // Idempotência: se já está confirmado, não repete o trabalho.
    if (payment.status === "confirmed") {
      return new Response(JSON.stringify({ received: true, alreadyConfirmed: true }), {
        status: 200,
      });
    }

    // Só nos interessa o evento de sucesso — outros estados (pending,
    // processing) não mudam nada aqui.
    const sucesso = status === "paid" || status === "confirmed" || status === "success";
    if (!sucesso) {
      if (status === "failed" || status === "expired") {
        await supabase
          .from("payments")
          .update({ status: "failed", fail_reason: `ZumboPay: ${status}` })
          .eq("id", payment.id);
      }
      return new Response(JSON.stringify({ received: true, status }), { status: 200 });
    }

    const now = new Date().toISOString();

    // 1) Confirma o pagamento (igual ao confirmPayment() manual)
    await supabase
      .from("payments")
      .update({
        status: "confirmed",
        operator_ref: zumbopayPaymentId ?? reference,
        confirmed_at: now,
      })
      .eq("id", payment.id);

    // 2) Activa a assinatura do negócio (só para planos reais, não "boost")
    if (payment.plan_id && payment.plan_id !== "boost") {
      const renewsAt = new Date();
      renewsAt.setMonth(renewsAt.getMonth() + 1);
      await supabase
        .from("businesses")
        .update({
          plan_status: "active",
          plan_id: payment.plan_id,
          last_payment_at: now,
          plan_renews_at: renewsAt.toISOString(),
        })
        .eq("id", payment.business_id);
    }

    return new Response(JSON.stringify({ received: true, confirmed: true }), { status: 200 });
  } catch (err) {
    console.error("zumbopay-webhook: erro inesperado", err);
    return new Response(JSON.stringify({ error: "internal_error" }), { status: 500 });
  }
});
