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
import {
  sendReservationChatMessage,
  sendReservationPush,
  sendReservationAdminEmail,
  buildReservationEmailHtml,
} from "../_shared/reservation-notify.ts";

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
    // processing) não mudam nada aqui. Confirmado no dashboard da
    // ZumboPay (Novo webhook → Eventos a receber): os nomes reais são
    // "payment.succeeded" / "payment.failed" (no campo "event"), não
    // um campo "status" separado como se assumiu inicialmente. Aceita
    // ambos os formatos para não partir se a ZumboPay também mandar
    // "status" nalguns payloads.
    const sucesso =
      eventType === "payment.succeeded" ||
      status === "paid" ||
      status === "confirmed" ||
      status === "success";
    const falhou =
      eventType === "payment.failed" || status === "failed" || status === "expired";
    if (!sucesso) {
      if (falhou) {
        await supabase
          .from("payments")
          .update({ status: "failed", fail_reason: `ZumboPay: ${eventType ?? status}` })
          .eq("id", payment.id);
      }
      return new Response(JSON.stringify({ received: true, status, eventType }), { status: 200 });
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

// 2) Activa o que foi pago — casos possíveis: boost, post, event, room
//    (reserva de quarto — cria pending_approval), table (reserva de
//    mesa — confirma automaticamente), ou assinatura (starter/pro/premium).
    if (payment.plan_id === "boost") {
      // Turbinar: cria a linha em business_boosts, com expires_at à
      // meia-noite (CAT, UTC+2) N dias depois — mesmo cálculo usado em
      // activateBoost() (boost-storage.ts) no fluxo manual, replicado
      // aqui porque o webhook corre no servidor, não no browser.
      const BOOST_DAYS: Record<string, number> = { "1d": 1, "7d": 7, "30d": 30 };
      const packageId: string = payment.boost_package_id ?? "1d";
      const days = BOOST_DAYS[packageId] ?? 1;

      const CAT_OFFSET_MIN = 120;
      const nowDate = new Date();
      const catNow = new Date(nowDate.getTime() + CAT_OFFSET_MIN * 60 * 1000);
      const targetDayCAT = new Date(
        Date.UTC(catNow.getUTCFullYear(), catNow.getUTCMonth(), catNow.getUTCDate() + days, 0, 0, 0),
      );
      const expiresAt = new Date(targetDayCAT.getTime() - CAT_OFFSET_MIN * 60 * 1000);

      await supabase.from("business_boosts").insert({
        business_id: payment.business_id,
        payment_id: payment.id,
        package_id: packageId,
        duration_days: days,
        activated_at: now,
        expires_at: expiresAt.toISOString(),
      });
    } else if (payment.plan_id === "post") {
      // Publicação paga no feed: cria a linha já "active", com
      // expires_at calculado a partir do pacote de horas escolhido.
      // O conteúdo (foto/legenda) veio guardado em content_metadata
      // quando o Payment Link foi criado.
      const POST_HOURS: Record<string, number> = { "24h": 24, "3d": 72, "7d": 168 };
      const packageId: string = payment.boost_package_id ?? "24h";
      const hours = POST_HOURS[packageId] ?? 24;
      const meta = (payment.content_metadata ?? {}) as Record<string, unknown>;

      const nowDate = new Date();
      const expiresAt = new Date(nowDate.getTime() + hours * 60 * 60 * 1000);

      await supabase.from("business_posts").insert({
        business_id: payment.business_id,
        photo_url: meta.photo_url ?? meta.photoUrl ?? "",
        caption: meta.caption ?? null,
        city: meta.city ?? null,
        package_id: packageId,
        payment_id: payment.id,
        status: "active",
        published_at: now,
        expires_at: expiresAt.toISOString(),
      });
    } else if (payment.plan_id === "event") {
      // Evento: cria a linha já "active" — sem expiração automática por
      // agora (o admin/dono pode gerir manualmente depois do evento passar).
      const meta = (payment.content_metadata ?? {}) as Record<string, unknown>;

      await supabase.from("events").insert({
        business_id: payment.business_id,
        poster_url: meta.poster_url ?? meta.posterUrl ?? "",
        title: meta.title ?? "Evento",
        ticket_phone: meta.ticket_phone ?? meta.ticketPhone ?? null,
        ticket_link: meta.ticket_link ?? meta.ticketLink ?? null,
        event_date: meta.event_date ?? meta.eventDate ?? null,
        city: meta.city ?? null,
        tier: payment.boost_package_id ?? "standard",
        payment_id: payment.id,
        status: "active",
      });
    } else if (payment.plan_id === "room") {
      // Reserva de quarto: cria a linha já "pending_approval" — o
      // comerciante ainda tem de aceitar ou recusar. A comissão (10%
      // do valor total da estadia) já foi cobrada; o resto (90%) o
      // cliente paga directo no hotel, fora do app.
      const meta = (payment.content_metadata ?? {}) as Record<string, unknown>;

      const { data: room } = await supabase
        .from("business_rooms")
        .select("business_id")
        .eq("id", meta.roomId)
        .maybeSingle();
      const { data: biz } = await supabase
        .from("businesses")
        .select("business_name, owner_id")
        .eq("id", payment.business_id)
        .maybeSingle();

      const { data: reservation } = await supabase
        .from("room_reservations")
        .insert({
          business_id: payment.business_id,
          room_id: meta.roomId,
          client_user_id: meta.clientUserId,
          client_name: meta.clientName,
          client_phone: meta.clientPhone,
          client_email: meta.clientEmail ?? null,
          check_in: meta.checkIn,
          check_out: meta.checkOut,
          guests: meta.guests,
          special_request: meta.specialRequest ?? null,
          nights: meta.nights,
          total_price: meta.totalPrice,
          commission_amount: meta.commissionAmount,
          payment_id: payment.id,
          status: "pending_approval",
        })
        .select()
        .single();

      const businessName = biz?.business_name ?? "o negócio";

      // Chat + push ao cliente: pedido enviado, a aguardar confirmação.
      if (meta.clientUserId) {
        await sendReservationChatMessage(
          payment.business_id,
          meta.clientUserId as string,
          `Recebemos o seu pedido de reserva — ${meta.roomName}, ${meta.checkIn} a ${meta.checkOut}, ${meta.guests} hóspede(s). Estamos a aguardar confirmação de ${businessName}.`,
        );
        await sendReservationPush(
          meta.clientUserId as string,
          "Pedido de reserva enviado",
          `A aguardar confirmação de ${businessName}.`,
        );
      }
      // Push ao comerciante: tem um pedido novo pendente.
      if (biz?.owner_id) {
        await sendReservationPush(
          biz.owner_id,
          "Nova reserva de quarto pendente",
          `${meta.roomName} — ${meta.checkIn} a ${meta.checkOut} — aceite ou recuse no dashboard.`,
        );
      }
      // E-mail para xtackoficial@gmail.com
      await sendReservationAdminEmail(
        `Reserva de quarto paga — ${businessName}`,
        buildReservationEmailHtml([
          ["Negócio", businessName],
          ["Quarto", String(meta.roomName ?? "")],
          ["Check-in / Check-out", `${meta.checkIn} → ${meta.checkOut} (${meta.nights} noites)`],
          ["Hóspedes", String(meta.guests ?? "")],
          ["Cliente", `${meta.clientName} — ${meta.clientPhone}`],
          ["E-mail do cliente", String(meta.clientEmail ?? "—")],
          ["Valor total da estadia", `${meta.totalPrice} MT`],
          ["Comissão cobrada agora", `${meta.commissionAmount} MT`],
          ["Pedido especial", String(meta.specialRequest ?? "—")],
          ["Estado", "Pendente de aprovação pelo comerciante"],
        ]),
      );
    } else if (payment.plan_id === "table") {
      // Reserva de mesa: confirma-se automaticamente (sem passo de
      // aprovação, ao contrário do quarto). Valor cobrado é o preço
      // fixo cheio; metade fica de comissão, metade é repassada
      // manualmente ao negócio depois (ver repassado na tabela).
      const meta = (payment.content_metadata ?? {}) as Record<string, unknown>;
      const { data: biz } = await supabase
        .from("businesses")
        .select("business_name, owner_id")
        .eq("id", payment.business_id)
        .maybeSingle();

      await supabase.from("table_reservations").insert({
        business_id: payment.business_id,
        client_user_id: meta.clientUserId,
        client_name: meta.clientName,
        client_phone: meta.clientPhone,
        client_email: meta.clientEmail ?? null,
        reservation_date: meta.reservationDate,
        time_slot: meta.timeSlot,
        guests: meta.guests,
        special_request: meta.specialRequest ?? null,
        tipo: meta.tipo ?? "normal",
        price: meta.price,
        commission_amount: meta.commissionAmount,
        payout_amount: meta.payoutAmount,
        payment_id: payment.id,
        status: "confirmed",
      });

      const businessName = biz?.business_name ?? "o negócio";

      if (meta.clientUserId) {
        await sendReservationChatMessage(
          payment.business_id,
          meta.clientUserId as string,
          `A sua reserva está confirmada — Mesa para ${meta.guests}, ${meta.reservationDate} às ${meta.timeSlot}. Vemo-nos lá!`,
        );
        await sendReservationPush(
          meta.clientUserId as string,
          "Reserva de mesa confirmada",
          `${businessName} — ${meta.reservationDate} às ${meta.timeSlot}.`,
        );
      }
      if (biz?.owner_id) {
        await sendReservationPush(
          biz.owner_id,
          "Nova reserva de mesa confirmada",
          `${meta.reservationDate} às ${meta.timeSlot} — ${meta.guests} pessoa(s).`,
        );
      }
      await sendReservationAdminEmail(
        `Reserva de mesa paga — ${businessName}`,
        buildReservationEmailHtml([
          ["Negócio", businessName],
          ["Data / hora", `${meta.reservationDate} — ${meta.timeSlot}`],
          ["Pessoas", String(meta.guests ?? "")],
          ["Cliente", `${meta.clientName} — ${meta.clientPhone}`],
          ["Tipo", String(meta.tipo ?? "normal")],
          ["Valor total pago", `${meta.price} MT`],
          ["A tua comissão", `${meta.commissionAmount} MT`],
          ["A repassar ao negócio", `${meta.payoutAmount} MT (repassado: não)`],
          ["Pedido especial", String(meta.specialRequest ?? "—")],
          ["Estado", "Confirmada automaticamente"],
        ]),
      );
    } else if (payment.plan_id) {
      // Assinatura mensal (starter/pro/premium)
      const renewsAt = new Date();
      renewsAt.setMonth(renewsAt.getMonth() + 1);
      const { error: planUpdateError } = await supabase
        .from("businesses")
        .update({
          plan_status: "active",
          plan_id: payment.plan_id,
          last_payment_at: now,
          plan_renews_at: renewsAt.toISOString(),
        })
        .eq("id", payment.business_id);
      // CORREÇÃO (2026-09-21): antes, um erro aqui (ex: trigger a
      // reverter os campos por o service_role não ser reconhecido —
      // ver 005_fix_service_role_triggers.sql) passava despercebido.
      // Agora fica sempre no log da função, mesmo que o pagamento em
      // si já tenha sido confirmado.
      if (planUpdateError) {
        console.error(
          "zumbopay-webhook: pagamento confirmado mas falhou activar o plano",
          payment.business_id, payment.plan_id, planUpdateError,
        );
      }
    }

    return new Response(JSON.stringify({ received: true, confirmed: true }), { status: 200 });
  } catch (err) {
    console.error("zumbopay-webhook: erro inesperado", err);
    return new Response(JSON.stringify({ error: "internal_error" }), { status: 500 });
  }
});
