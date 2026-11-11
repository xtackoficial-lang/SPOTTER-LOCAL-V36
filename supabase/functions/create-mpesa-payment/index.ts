// ============================================================
// XTACK SPOTTER — Edge Function: create-mpesa-payment
// ------------------------------------------------------------
// Substitui create-zumbopay-payment + zumbopay-webhook. Cobra o cliente
// directamente pela API M-Pesa da Vodacom (C2B "single stage"): o cliente
// recebe o pedido de PIN no telemóvel e a resposta chega NA MESMA CHAMADA —
// por isso não há webhook nem link de pagamento.
//
// Duas acções (campo "action" no corpo):
//   (omitida)  → cria o pagamento e cobra. Mesmos planId/valores que antes:
//                starter/pro/premium, boost, post, event, room, table.
//                Precisa de "payerPhone" (84/85) — o número que paga.
//   "check"    → { paymentId } pergunta à M-Pesa o estado de um pagamento que
//                ficou "pending" (ligação caída, timeout) e activa-o se já foi pago.
//
// O preço é SEMPRE calculado aqui, no servidor. A activação (plano, reserva,
// evento…) está em _shared/fulfill-payment.ts, igual à que o webhook usava.
//
// Secrets: ver _shared/mpesa.ts (MPESA_API_KEY, MPESA_PUBLIC_KEY,
// MPESA_SERVICE_PROVIDER_CODE, MPESA_ENV).
// ============================================================

// @ts-nocheck — ambiente Deno (Supabase Edge Functions).
import { createClient } from "jsr:@supabase/supabase-js@2";
import { clientIp, LIMITS, rateLimit, tooManyRequests } from "../_shared/rate-limit.ts";
import {
  normalizePhone,
  normalizeWalletPhone,
  validateEmail,
  validatePersonName,
} from "../_shared/validators.ts";
import {
  c2bSingleStage,
  mpesaConfigured,
  queryTransactionStatus,
  toMsisdn,
} from "../_shared/mpesa.ts";
import { fulfillPayment } from "../_shared/fulfill-payment.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";

// Reservas (room/table) precisam de saber QUEM está a reservar, de forma
// seria — nunca confiar num "clientUserId" vindo do corpo do pedido
// (qualquer pessoa podia pôr o id de outra pessoa). Em vez disso, lê-se
// o utilizador autenticado a partir do próprio token da sessão.
async function getAuthenticatedUserId(req: Request): Promise<string | null> {
  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  if (!token || !SUPABASE_ANON_KEY) return null;
  try {
    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data, error } = await userClient.auth.getUser();
    if (error || !data?.user) return null;
    return data.user.id;
  } catch {
    return null;
  }
}

const PLAN_PRICES: Record<string, number> = {
  starter: 300,
  pro: 500,
  premium: 900,
};

// Turbinar: preço linear por dia (mesma fonte que BOOST_PRICE_PER_DAY_MZN
// em src/lib/boost-storage.ts — mantém os dois sincronizados se um mudar).
const BOOST_PRICE_PER_DAY = 60;
const BOOST_DAYS: Record<string, number> = { "1d": 1, "7d": 7, "30d": 30 };

// Publicação paga no feed (só fotos) — preço por pacote de duração.
const POST_PRICES: Record<string, number> = { "24h": 50, "3d": 120, "7d": 250 };
const POST_HOURS: Record<string, number> = { "24h": 24, "3d": 72, "7d": 168 };

// Eventos — listagem simples ou com destaque (topo da aba Eventos).
const EVENT_PRICES: Record<string, number> = { standard: 100, featured: 250 }; // só para apps antigas em cache
// v38 — evento por dia: 50 MZN por dia, de 1 a 30 dias. O servidor calcula o valor.
const EVENT_PRICE_PER_DAY = 50;
const EVENT_MAX_DAYS = 30;

// Reservas — comissão da plataforma:
//   quarto: 10% do valor total da estadia (preço/noite × nº de noites)
//   mesa: valor fixo (200 normal / 500 evento, configurável por negócio),
//         metade fica de comissão, a outra metade é repassada manualmente
// Quarto — o cliente escolhe (pedido do Abrão, 2026-09-30):
//   "full"    → paga 100% do valor da estadia agora
//   "deposit" → paga um sinal de 20% para garantir a reserva; o resto
//               paga-se no hotel. (A antiga opção de 10% foi removida.)
// A comissão da plataforma continua a ser 10% do valor total da estadia e
// sai do que o cliente pagou; o que sobra é repassado ao hotel (manual).
const ROOM_DEPOSIT_PCT = 0.20;
const ROOM_COMMISSION_PCT = 0.10;

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/json",
};

// Categorias que podem receber reservas online — TEM de ficar igual a
// src/lib/reservation-eligibility.ts e à migração 009.
const ROOM_CATEGORIES = ["hotel", "hotel_restaurant", "pension"];
const TABLE_CATEGORIES = ["hotel", "hotel_restaurant", "restaurant", "snack_bar", "tourism_site"];

// Alfanumérica e com no máximo 20 caracteres (a M-Pesa pode rejeitar hífens / refs longas).
function makeRef(businessId: string, planId: string): string {
  const ts = Date.now().toString(36).toUpperCase(); // ~8
  const bid = businessId.replace(/[^a-z0-9]/gi, "").slice(0, 3).toUpperCase();
  const rnd = Math.random().toString(36).slice(2, 5).toUpperCase();
  return `XL${bid}${planId.slice(0, 1).toUpperCase()}${ts}${rnd}`.slice(0, 20);
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

  // Rate limiting por IP (rede de segurança antes de qualquer trabalho): 30 pedidos / 10 min.
  {
    const rl = await rateLimit(supabase, `pay:ip:${clientIp(req)}`, 30, LIMITS.payment.window);
    if (!rl.allowed) return tooManyRequests(rl.retryAfter, CORS_HEADERS);
  }

  let body: {
    businessId?: string;
    planId?: string;
    boostPackageId?: string;
    postPackageId?: string;
    eventTier?: string;
    eventDays?: number | null; // nº de dias que o evento fica publicado (1 a 30)
    contentMetadata?: Record<string, unknown>;
    // Reserva de quarto (planId === "room")
    roomId?: string;
    checkIn?: string;   // "YYYY-MM-DD"
    checkOut?: string;  // "YYYY-MM-DD"
    // Pensão (v38): reserva por hora. checkIn = dia, startTime = "HH:MM", hours = nº de horas.
    bookingUnit?: "night" | "hour";
    hours?: number;
    startTime?: string;
    guests?: number;
    specialRequest?: string;
    clientName?: string;
    clientPhone?: string;
    clientEmail?: string;
    // M-Pesa
    action?: "check";
    paymentId?: string;
    payerPhone?: string; // número M-Pesa que paga (84/85)
    // Reserva de mesa (planId === "table")
    reservationDate?: string; // "YYYY-MM-DD"
    timeSlot?: string;
    tableTipo?: "normal" | "evento";
  };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "corpo do pedido inválido (JSON esperado)" }), {
      status: 400,
      headers: CORS_HEADERS,
    });
  }

  // ── Acção "check": reconfirma na M-Pesa um pagamento que ficou pendente ──
  if (body.action === "check") {
    try {
      return await handleCheck(req, body.paymentId);
    } catch (err) {
      console.error("create-mpesa-payment: erro no check", err);
      return json({ error: "internal_error" }, 500);
    }
  }

  let {
    businessId, planId, boostPackageId, postPackageId, eventTier, eventDays, contentMetadata,
    roomId, paymentOption, checkIn, checkOut, bookingUnit, hours, startTime, guests, specialRequest, clientName, clientPhone, clientEmail,
    reservationDate, timeSlot, tableTipo, payerPhone,
  } = body;

  try {
    const isBoost = planId === "boost";
    const isPost = planId === "post";
    const isEvent = planId === "event";
    const isRoom = planId === "room";
    const isTable = planId === "table";
    const boostDays = isBoost ? BOOST_DAYS[boostPackageId ?? ""] : undefined;
    const postHours = isPost ? POST_HOURS[postPackageId ?? ""] : undefined;
    const eventDaysNum = isEvent && eventDays != null ? Math.round(Number(eventDays)) : null;
    const eventDaysOk = eventDaysNum != null && eventDaysNum >= 1 && eventDaysNum <= EVENT_MAX_DAYS;
    const eventPrice = isEvent
      ? eventDays != null
        ? eventDaysOk
          ? eventDaysNum! * EVENT_PRICE_PER_DAY
          : undefined
        : EVENT_PRICES[eventTier ?? "standard"]
      : undefined;

    let authenticatedUserId: string | null = null;
    if (isRoom || isTable) {
      authenticatedUserId = await getAuthenticatedUserId(req);
      if (!authenticatedUserId) {
        return new Response(
          JSON.stringify({ error: "É preciso estar autenticado para fazer uma reserva" }),
          { status: 401, headers: CORS_HEADERS },
        );
      }
      {
        const rl = await rateLimit(supabase, `pay:${authenticatedUserId}`, LIMITS.payment.limit, LIMITS.payment.window);
        if (!rl.allowed) return tooManyRequests(rl.retryAfter, CORS_HEADERS);
      }
    }

    const validoBase =
      businessId &&
      typeof businessId === "string" &&
      planId &&
      (isBoost ? !!boostDays
        : isPost ? !!postHours
        : isEvent ? !!eventPrice
        : isRoom ? (!!roomId && !!checkIn && (!!checkOut || bookingUnit === "hour") && !!guests && !!clientName && !!clientPhone)
        : isTable ? (!!reservationDate && !!timeSlot && !!guests && !!clientName && !!clientPhone)
        : !!PLAN_PRICES[planId]);

    if (!validoBase) {
      return new Response(
        JSON.stringify({ error: "businessId, planId, ou dados da reserva incompletos" }),
        { status: 400, headers: CORS_HEADERS },
      );
    }

    // Número que paga: M-Pesa só funciona com 84/85.
    const payerCheck = normalizeWalletPhone(payerPhone ?? "", "mpesa");
    if (!payerCheck.ok) {
      return json({ error: payerCheck.error }, 400);
    }
    const msisdn = toMsisdn(payerCheck.value);

    // v41 (segurança): o servidor valida de novo os dados do cliente — quem chama a API
    // directamente (sem passar pela app) não contorna as regras. Nome só com letras,
    // telemóvel real (sem dígitos a mais/inventados), email (se existir) com formato real.
    if (isRoom || isTable) {
      const nameCheck = validatePersonName(clientName ?? "", "nome");
      if (!nameCheck.ok) {
        return new Response(JSON.stringify({ error: nameCheck.error }), { status: 400, headers: CORS_HEADERS });
      }
      const phoneCheck = normalizePhone(clientPhone ?? "");
      if (!phoneCheck.ok) {
        return new Response(JSON.stringify({ error: phoneCheck.error }), { status: 400, headers: CORS_HEADERS });
      }
      if (clientEmail) {
        const emailCheck = validateEmail(clientEmail);
        if (!emailCheck.ok) {
          return new Response(JSON.stringify({ error: emailCheck.error }), { status: 400, headers: CORS_HEADERS });
        }
        clientEmail = emailCheck.value;
      }
      const guestsNum = Number(guests);
      if (!Number.isInteger(guestsNum) || guestsNum < 1 || guestsNum > 50) {
        return new Response(JSON.stringify({ error: "Número de pessoas inválido (1 a 50)." }), {
          status: 400,
          headers: CORS_HEADERS,
        });
      }
      clientName = nameCheck.value;
      clientPhone = phoneCheck.value;
    }

    // Reservas precisam de ir à base de dados calcular o preço —
    // ao contrário dos restantes planos, que são valores fixos.
    let roomReservationMeta: Record<string, unknown> | null = null;
    let tableReservationMeta: Record<string, unknown> | null = null;
    let amount: number;

    if (isRoom) {
      const { data: room, error: roomErr } = await supabase
        .from("business_rooms")
        .select("id, business_id, name, price_per_night, price_per_hour, active")
        .eq("id", roomId)
        .eq("business_id", businessId)
        .maybeSingle();

      // A categoria do negócio tem de poder receber reservas de quarto
      // (um táxi ou uma farmácia nunca podem, mesmo com dados forçados).
      const { data: roomBiz } = await supabase
        .from("businesses")
        .select("category, accepts_room_reservation")
        .eq("id", businessId)
        .maybeSingle();
      if (!roomBiz || !ROOM_CATEGORIES.includes(roomBiz.category) || !roomBiz.accepts_room_reservation) {
        return new Response(
          JSON.stringify({ error: "Este negócio não aceita reservas de quarto" }),
          { status: 400, headers: CORS_HEADERS },
        );
      }

      if (roomErr || !room || !room.active) {
        return new Response(
          JSON.stringify({ error: "Quarto não encontrado ou indisponível" }),
          { status: 400, headers: CORS_HEADERS },
        );
      }

      // v38 — o cliente escolhe POR HORA ou POR DIA/NOITE. O servidor calcula
      // o valor a partir dos preços do quarto (nunca confia no cliente).
      const unit: "hour" | "night" = bookingUnit === "hour" ? "hour" : "night";
      let nights = 0;
      let hoursCount = 0;
      let totalPrice = 0;
      const bad = (msg: string) =>
        new Response(JSON.stringify({ error: msg }), { status: 400, headers: CORS_HEADERS });
      if (unit === "hour") {
        const pph = Number(room.price_per_hour ?? 0);
        if (!pph || pph <= 0) return bad("Este quarto não tem preço por hora");
        hoursCount = Math.round(Number(hours));
        if (!hoursCount || hoursCount < 1 || hoursCount > 12) {
          return bad("Número de horas inválido (1 a 12)");
        }
        if (!startTime || !/^([01]\d|2[0-3]):[0-5]\d$/.test(startTime)) {
          return bad("Hora de entrada inválida");
        }
        totalPrice = pph * hoursCount;
      } else {
        const ppn = Number(room.price_per_night ?? 0);
        if (!ppn || ppn <= 0) return bad("Este quarto não tem preço por dia");
        nights = Math.round(
          (new Date(checkOut!).getTime() - new Date(checkIn!).getTime()) / (1000 * 60 * 60 * 24),
        );
        if (!nights || nights < 1) return bad("Datas de entrada/saída inválidas");
        totalPrice = ppn * nights;
      }
      const option = paymentOption === "full" ? "full" : paymentOption === "deposit" || paymentOption == null ? "deposit" : null;
      if (!option) {
        return new Response(
          JSON.stringify({ error: "Opção de pagamento inválida (full ou deposit)" }),
          { status: 400, headers: CORS_HEADERS },
        );
      }
      // O servidor é quem calcula o valor — o cliente só escolhe a opção.
      amount = option === "full"
        ? Math.round(totalPrice * 100) / 100
        : Math.round(totalPrice * ROOM_DEPOSIT_PCT * 100) / 100;
      const commissionAmount = Math.round(totalPrice * ROOM_COMMISSION_PCT * 100) / 100;

      roomReservationMeta = {
        roomId: room.id,
        roomName: room.name,
        clientUserId: authenticatedUserId,
        checkIn,
        checkOut: unit === "hour" ? checkIn : checkOut,
        nights,
        bookingUnit: unit,
        hours: unit === "hour" ? hoursCount : null,
        startTime: unit === "hour" ? startTime : null,
        pricePerHour: room.price_per_hour ?? null,
        guests,
        specialRequest: specialRequest ?? null,
        clientName,
        clientPhone,
        clientEmail: clientEmail ?? null,
        pricePerNight: room.price_per_night,
        totalPrice,
        paymentOption: option,
        amountPaid: amount,
        balanceDue: Math.round((totalPrice - amount) * 100) / 100,
        commissionAmount,
      };
    } else if (isTable) {
      const { data: biz, error: bizErr } = await supabase
        .from("businesses")
        .select("id, category, mesa_preco_normal, mesa_preco_evento, accepts_table_reservation")
        .eq("id", businessId)
        .maybeSingle();

      if (bizErr || !biz || !biz.accepts_table_reservation || !TABLE_CATEGORIES.includes(biz.category)) {
        return new Response(
          JSON.stringify({ error: "Este negócio não aceita reservas de mesa" }),
          { status: 400, headers: CORS_HEADERS },
        );
      }

      const tipo = tableTipo === "evento" ? "evento" : "normal";
      const price = tipo === "evento" ? biz.mesa_preco_evento : biz.mesa_preco_normal;
      amount = price; // cobra-se o valor cheio; a divisão (metade/metade) acontece depois de confirmado

      tableReservationMeta = {
        reservationDate,
        timeSlot,
        clientUserId: authenticatedUserId,
        guests,
        specialRequest: specialRequest ?? null,
        clientName,
        clientPhone,
        clientEmail: clientEmail ?? null,
        tipo,
        price,
        commissionAmount: Math.round((price / 2) * 100) / 100,
        payoutAmount: Math.round((price / 2) * 100) / 100,
      };
    } else {
      amount = isBoost
        ? boostDays! * BOOST_PRICE_PER_DAY
        : isPost
          ? POST_PRICES[postPackageId!]
          : isEvent
            ? eventPrice!
            : PLAN_PRICES[planId!];
    }
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 10 * 60 * 1000); // 10 min, igual ao fluxo manual

    // Trava duplo clique: um 2.º pedido de PIN ao mesmo número enquanto o 1.º
    // ainda está à espera seria cobrança em dobro.
    {
      const since = new Date(now.getTime() - 90 * 1000).toISOString();
      const { data: inflight } = await supabase
        .from("payments")
        .select("id")
        .eq("method", "mpesa")
        .eq("status", "pending")
        .eq("phone", payerCheck.value)
        .gt("created_at", since)
        .limit(1)
        .maybeSingle();
      if (inflight) {
        return json(
          { error: "Já há um pagamento à espera de confirmação neste número. Confirma no telemóvel ou espera um minuto." },
          409,
        );
      }
    }

    const merchantRef = makeRef(businessId!, planId!);

    // 1) Cria a linha em "payments" já como pending — mesma tabela do
    //    fluxo manual, para aparecer em /admin como qualquer outro pagamento.
    //    Para post/event, o conteúdo (foto/cartaz/legenda) vai em
    //    content_metadata — o webhook usa isto para criar a publicação/
    //    evento no momento da confirmação, sem depender do browser aberto.
    const { data: paymentRow, error: insertError } = await supabase
      .from("payments")
      .insert({
        business_id: businessId,
        merchant_ref: merchantRef,
        plan_id: planId,
        boost_package_id: isBoost ? boostPackageId : isPost ? postPackageId : isEvent ? eventTier ?? "standard" : null,
        content_metadata: isEvent
          ? { ...(contentMetadata ?? {}), days: eventDaysOk ? eventDaysNum : null }
          : isPost
          ? (contentMetadata ?? null)
          : isRoom
            ? roomReservationMeta
            : isTable
              ? tableReservationMeta
              : null,
        amount,
        currency: "MZN",
        method: "mpesa",
        phone: payerCheck.value,
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
      console.error("create-mpesa-payment: falha ao criar linha payments", insertError);
      return new Response(JSON.stringify({ error: "Falha ao registar o pagamento" }), {
        status: 500,
        headers: CORS_HEADERS,
      });
    }

    if (!mpesaConfigured()) {
      console.error("create-mpesa-payment: faltam secrets MPESA_*");
      await supabase
        .from("payments")
        .update({ status: "failed", fail_reason: "Configuração M-Pesa incompleta" })
        .eq("id", paymentRow.id);
      return json({ error: "Pagamento M-Pesa indisponível de momento" }, 500);
    }

    // 2) Cobra o cliente. Fica aqui à espera até ele digitar o PIN (até ~60 s).
    let outcome: any;
    try {
      outcome = await c2bSingleStage({
        amount,
        msisdn,
        transactionReference: merchantRef,
        thirdPartyReference: merchantRef,
      });
    } catch (netErr) {
      console.error("create-mpesa-payment: falha de rede/timeout na M-Pesa", netErr);
      outcome = { state: "unknown", code: "NET", description: String(netErr) };
    }

    // Resposta em dúvida (timeout, erro interno): pergunta o estado antes de decidir.
    if (outcome.state === "unknown") {
      const q = await queryTransactionStatus(merchantRef, merchantRef);
      if (q === "success") outcome = { state: "success", transactionId: null, code: outcome.code, description: "confirmado por consulta" };
      else if (q === "failed") outcome = { state: "failed", code: outcome.code, description: "falhou (consulta)", userMessage: "O pagamento não foi concluído. Tenta outra vez." };
    }

    const result = await settlePayment(paymentRow, outcome);
    return json({
      paymentId: paymentRow.id,
      merchantRef,
      amount,
      createdAt: paymentRow.created_at,
      expiresAt: expiresAt.toISOString(),
      ...result,
    });
  } catch (err) {
    console.error("create-mpesa-payment: erro inesperado", err);
    return json({ error: "internal_error" }, 500);
  }
});

// ── Funções de apoio (usadas pelo fluxo principal e pelo "check") ─────────────

function json(obj: unknown, status = 200): Response {
  return new Response(JSON.stringify(obj), { status, headers: CORS_HEADERS });
}

/**
 * Aplica o resultado da M-Pesa à linha de pagamento.
 *  success → marca confirmed (só se ainda estava pending: evita activar 2 vezes) e activa o que foi pago
 *  failed  → marca failed com o motivo
 *  unknown → deixa pending (o cliente volta a perguntar com action "check")
 */
async function settlePayment(
  payment: any,
  outcome: any,
): Promise<{ status: "confirmed" | "failed" | "pending"; error?: string }> {
  if (outcome.state === "success") {
    const { data: claimed } = await supabase
      .from("payments")
      .update({
        status: "confirmed",
        operator_ref: outcome.transactionId ?? payment.merchant_ref,
        confirmed_at: new Date().toISOString(),
      })
      .eq("id", payment.id)
      .eq("status", "pending")
      .select()
      .maybeSingle();
    if (claimed) {
      try {
        await fulfillPayment(supabase, claimed);
      } catch (err) {
        // O dinheiro já foi cobrado: nunca devolver erro ao cliente por causa disto.
        console.error("PAGO MAS NÃO ACTIVADO — verificar à mão:", payment.id, payment.plan_id, err);
        await supabase
          .from("payments")
          .update({ fail_reason: `fulfil_error: ${String((err as Error)?.message ?? err).slice(0, 180)}` })
          .eq("id", payment.id);
      }
    }
    return { status: "confirmed" };
  }
  if (outcome.state === "failed") {
    await supabase
      .from("payments")
      .update({ status: "failed", fail_reason: `M-Pesa ${outcome.code}: ${outcome.description}`.slice(0, 250) })
      .eq("id", payment.id)
      .eq("status", "pending");
    return { status: "failed", error: outcome.userMessage };
  }
  return { status: "pending" };
}

async function handleCheck(req: Request, paymentId?: string): Promise<Response> {
  if (!paymentId) return json({ error: "paymentId em falta" }, 400);
  const uid = await getAuthenticatedUserId(req);
  if (!uid) return json({ error: "Sessão inválida" }, 401);

  const { data: payment } = await supabase.from("payments").select("*").eq("id", paymentId).maybeSingle();
  if (!payment || payment.method !== "mpesa") return json({ error: "Pagamento não encontrado" }, 404);

  // Só quem fez o pedido (cliente da reserva) ou o dono do negócio pode perguntar.
  const meta = (payment.content_metadata ?? {}) as Record<string, unknown>;
  let allowed = meta.clientUserId === uid;
  if (!allowed) {
    const { data: biz } = await supabase.from("businesses").select("owner_id").eq("id", payment.business_id).maybeSingle();
    allowed = biz?.owner_id === uid;
  }
  if (!allowed) return json({ error: "Sem permissão" }, 403);

  if (payment.status === "confirmed") return json({ status: "confirmed" });
  if (payment.status === "failed") return json({ status: "failed", error: payment.fail_reason ?? undefined });

  const q = await queryTransactionStatus(payment.merchant_ref, payment.merchant_ref);
  if (q === "success") {
    return json(await settlePayment(payment, { state: "success", transactionId: null }));
  }
  if (q === "failed" || new Date(payment.expires_at).getTime() < Date.now()) {
    return json(
      await settlePayment(payment, {
        state: "failed",
        code: q === "failed" ? "QUERY" : "EXPIRED",
        description: q === "failed" ? "falhou (consulta)" : "expirou sem confirmação",
        userMessage: "O pagamento não foi confirmado. Tenta outra vez.",
      }),
    );
  }
  return json({ status: "pending" });
}
