// ============================================================
// XTACK SPOTTER — Edge Function: create-zumbopay-payment
// ------------------------------------------------------------
// Chamada pelo cliente (src/lib/payments-db.ts) quando o comerciante ou
// cliente escolhe "ZumboPay" como método de pagamento — assinaturas
// (starter/pro/premium), Turbinar (boost), Publicações (post), Eventos
// (event), e agora também Reservas de quarto (room) e mesa (table).
//
// O que faz:
//   1. Valida o plano e calcula o preço:
//        - boost/post/event/plano: valor fixo (tabelas PLAN_PRICES etc.)
//        - room: 10% do preço/noite × nº de noites do quarto (busca na BD)
//        - table: valor fixo do negócio (mesa_preco_normal/evento)
//   2. Cria a linha em "payments" (status pending) — igual ao fluxo
//      manual existente, para tudo continuar visível em /admin.
//   3. Chama a API da ZumboPay para gerar um Payment Link.
//   4. Grava a referência/URL devolvidas e devolve o link ao cliente.
//
// A reserva em si (room_reservations/table_reservations) só é criada
// pelo zumbopay-webhook, depois da confirmação do pagamento — nunca aqui.
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
const EVENT_PRICES: Record<string, number> = { standard: 100, featured: 250 };

// Reservas — comissão da plataforma:
//   quarto: 10% do valor total da estadia (preço/noite × nº de noites)
//   mesa: valor fixo (200 normal / 500 evento, configurável por negócio),
//         metade fica de comissão, a outra metade é repassada manualmente
const ROOM_COMMISSION_PCT = 0.10;

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

  let body: {
    businessId?: string;
    planId?: string;
    boostPackageId?: string;
    postPackageId?: string;
    eventTier?: string;
    contentMetadata?: Record<string, unknown>;
    // Reserva de quarto (planId === "room")
    roomId?: string;
    checkIn?: string;   // "YYYY-MM-DD"
    checkOut?: string;  // "YYYY-MM-DD"
    guests?: number;
    specialRequest?: string;
    clientName?: string;
    clientPhone?: string;
    clientEmail?: string;
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

  const {
    businessId, planId, boostPackageId, postPackageId, eventTier, contentMetadata,
    roomId, checkIn, checkOut, guests, specialRequest, clientName, clientPhone, clientEmail,
    reservationDate, timeSlot, tableTipo,
  } = body;

  try {
    const isBoost = planId === "boost";
    const isPost = planId === "post";
    const isEvent = planId === "event";
    const isRoom = planId === "room";
    const isTable = planId === "table";
    const boostDays = isBoost ? BOOST_DAYS[boostPackageId ?? ""] : undefined;
    const postHours = isPost ? POST_HOURS[postPackageId ?? ""] : undefined;
    const eventPrice = isEvent ? EVENT_PRICES[eventTier ?? "standard"] : undefined;

    let authenticatedUserId: string | null = null;
    if (isRoom || isTable) {
      authenticatedUserId = await getAuthenticatedUserId(req);
      if (!authenticatedUserId) {
        return new Response(
          JSON.stringify({ error: "É preciso estar autenticado para fazer uma reserva" }),
          { status: 401, headers: CORS_HEADERS },
        );
      }
    }

    const validoBase =
      businessId &&
      typeof businessId === "string" &&
      planId &&
      (isBoost ? !!boostDays
        : isPost ? !!postHours
        : isEvent ? !!eventPrice
        : isRoom ? (!!roomId && !!checkIn && !!checkOut && !!guests && !!clientName && !!clientPhone)
        : isTable ? (!!reservationDate && !!timeSlot && !!guests && !!clientName && !!clientPhone)
        : !!PLAN_PRICES[planId]);

    if (!validoBase) {
      return new Response(
        JSON.stringify({ error: "businessId, planId, ou dados da reserva incompletos" }),
        { status: 400, headers: CORS_HEADERS },
      );
    }

    // Reservas precisam de ir à base de dados calcular o preço —
    // ao contrário dos restantes planos, que são valores fixos.
    let roomReservationMeta: Record<string, unknown> | null = null;
    let tableReservationMeta: Record<string, unknown> | null = null;
    let amount: number;

    if (isRoom) {
      const { data: room, error: roomErr } = await supabase
        .from("business_rooms")
        .select("id, business_id, name, price_per_night, active")
        .eq("id", roomId)
        .eq("business_id", businessId)
        .maybeSingle();

      if (roomErr || !room || !room.active) {
        return new Response(
          JSON.stringify({ error: "Quarto não encontrado ou indisponível" }),
          { status: 400, headers: CORS_HEADERS },
        );
      }

      const nights = Math.round(
        (new Date(checkOut!).getTime() - new Date(checkIn!).getTime()) / (1000 * 60 * 60 * 24),
      );
      if (!nights || nights < 1) {
        return new Response(
          JSON.stringify({ error: "Datas de entrada/saída inválidas" }),
          { status: 400, headers: CORS_HEADERS },
        );
      }

      const totalPrice = room.price_per_night * nights;
      amount = Math.round(totalPrice * ROOM_COMMISSION_PCT * 100) / 100; // comissão de 10%, cobrada agora

      roomReservationMeta = {
        roomId: room.id,
        roomName: room.name,
        clientUserId: authenticatedUserId,
        checkIn,
        checkOut,
        nights,
        guests,
        specialRequest: specialRequest ?? null,
        clientName,
        clientPhone,
        clientEmail: clientEmail ?? null,
        pricePerNight: room.price_per_night,
        totalPrice,
        commissionAmount: amount,
      };
    } else if (isTable) {
      const { data: biz, error: bizErr } = await supabase
        .from("businesses")
        .select("id, mesa_preco_normal, mesa_preco_evento, accepts_table_reservation")
        .eq("id", businessId)
        .maybeSingle();

      if (bizErr || !biz || !biz.accepts_table_reservation) {
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
        content_metadata: isPost || isEvent
          ? (contentMetadata ?? null)
          : isRoom
            ? roomReservationMeta
            : isTable
              ? tableReservationMeta
              : null,
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
    const description = isBoost
      ? `Spotter Local — Turbinar (${boostPackageId})`
      : isPost
        ? `Spotter Local — Publicação (${postPackageId})`
        : isEvent
          ? `Spotter Local — Evento (${eventTier ?? "standard"})`
          : isRoom
            ? `Spotter Local — Reserva de quarto (comissão 10%)`
            : isTable
              ? `Spotter Local — Reserva de mesa (${(tableReservationMeta as any)?.tipo ?? "normal"})`
              : `Spotter Local — Plano ${planId}`;

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
        description,
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
