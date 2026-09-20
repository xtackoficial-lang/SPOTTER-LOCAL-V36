// ============================================================
// XTACK SPOTTER — Edge Function: reservation-respond
// ------------------------------------------------------------
// Chamada pelo dashboard do comerciante (aba Reservas) quando aceita ou
// recusa um pedido de quarto pendente (room_reservations, status =
// 'pending_approval'). Reservas de mesa não passam por aqui — confirmam-se
// automaticamente no webhook.
//
// Corpo esperado:
//   { reservationId: string, action: "accept" | "reject", reason?: string }
//   "reason" é obrigatório quando action === "reject" (lista de motivos
//   escolhida no ecrã — ver src/lib/reservation-reasons.ts).
//
// O que faz:
//   1. Confirma que quem chama é o dono do negócio dessa reserva.
//   2. Actualiza o estado (confirmed / rejected + motivo).
//   3. Dispara as notificações combinadas: chat + push ao cliente, e
//      e-mail para xtackoficial@gmail.com (com o telefone do cliente,
//      necessário para o reembolso manual quando é recusa).
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
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/json",
};

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

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "method_not_allowed" }), {
      status: 405,
      headers: CORS_HEADERS,
    });
  }

  try {
    const callerId = await getAuthenticatedUserId(req);
    if (!callerId) {
      return new Response(JSON.stringify({ error: "não autenticado" }), {
        status: 401,
        headers: CORS_HEADERS,
      });
    }

    const body = await req.json().catch(() => ({}));
    const { reservationId, action, reason } = body as {
      reservationId?: string;
      action?: "accept" | "reject";
      reason?: string;
    };

    if (!reservationId || (action !== "accept" && action !== "reject")) {
      return new Response(JSON.stringify({ error: "reservationId ou action inválido" }), {
        status: 400,
        headers: CORS_HEADERS,
      });
    }
    if (action === "reject" && !reason) {
      return new Response(
        JSON.stringify({ error: "É obrigatório escolher um motivo para recusar" }),
        { status: 400, headers: CORS_HEADERS },
      );
    }

    const { data: reservation, error: fetchErr } = await supabase
      .from("room_reservations")
      .select("*, business_rooms(name), businesses(business_name, owner_id)")
      .eq("id", reservationId)
      .maybeSingle();

    if (fetchErr || !reservation) {
      return new Response(JSON.stringify({ error: "Reserva não encontrada" }), {
        status: 404,
        headers: CORS_HEADERS,
      });
    }
    if (reservation.businesses?.owner_id !== callerId) {
      return new Response(JSON.stringify({ error: "Sem permissão para esta reserva" }), {
        status: 403,
        headers: CORS_HEADERS,
      });
    }
    if (reservation.status !== "pending_approval") {
      return new Response(
        JSON.stringify({ error: `Esta reserva já está em estado '${reservation.status}'` }),
        { status: 409, headers: CORS_HEADERS },
      );
    }

    const newStatus = action === "accept" ? "confirmed" : "rejected";
    await supabase
      .from("room_reservations")
      .update({
        status: newStatus,
        rejection_reason: action === "reject" ? reason : null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", reservationId);

    const businessName = reservation.businesses?.business_name ?? "o negócio";
    const roomName = reservation.business_rooms?.name ?? "o quarto";
    const ownerId = reservation.businesses?.owner_id as string | undefined;

    if (action === "accept") {
      await sendReservationChatMessage(
        reservation.business_id,
        reservation.client_user_id,
        `${businessName} confirmou a sua reserva. Restam ${Math.round((reservation.total_price - reservation.commission_amount) * 100) / 100} MT a pagar no check-in.`,
      );
      await sendReservationPush(
        reservation.client_user_id,
        "Reserva confirmada",
        `${businessName} confirmou o seu pedido — ${roomName}.`,
      );
      // Confirmação da própria ação, para o comerciante ter registo —
      // pedido do Abrão, 2026-09-19: "o comerciante também".
      if (ownerId) {
        await sendReservationPush(
          ownerId,
          "Reserva aceite",
          `Aceitaste a reserva de ${roomName} para ${reservation.client_name}.`,
        );
      }
      await sendReservationAdminEmail(
        `Reserva aceite — ${businessName}`,
        buildReservationEmailHtml([
          ["Negócio", businessName],
          ["Quarto", roomName],
          ["Cliente", `${reservation.client_name} — ${reservation.client_phone}`],
          ["Estado", "Aceite pelo comerciante"],
        ]),
      );
    } else {
      await sendReservationChatMessage(
        reservation.business_id,
        reservation.client_user_id,
        `Lamentamos, mas ${businessName} não pôde confirmar a sua reserva — motivo: ${reason}. O valor pago será reembolsado em breve.`,
      );
      await sendReservationPush(
        reservation.client_user_id,
        "Reserva não confirmada",
        `${businessName} não pôde confirmar — motivo: ${reason}. Reembolso em breve.`,
      );
      // Confirmação da própria ação, para o comerciante ter registo.
      if (ownerId) {
        await sendReservationPush(
          ownerId,
          "Reserva recusada",
          `Recusaste a reserva de ${roomName} para ${reservation.client_name} — motivo: ${reason}.`,
        );
      }
      // E-mail marcado claramente como "precisa de reembolso manual" —
      // inclui o telefone do cliente, é para onde vai o M-Pesa/e-Mola.
      await sendReservationAdminEmail(
        `⚠️ Reserva recusada — reembolsar ${reservation.client_phone}`,
        buildReservationEmailHtml([
          ["Negócio", businessName],
          ["Quarto", roomName],
          ["Cliente", reservation.client_name],
          ["Telefone (para reembolso)", reservation.client_phone],
          ["Motivo da recusa", reason ?? ""],
          ["Valor a reembolsar", `${reservation.commission_amount} MT`],
          ["Reembolso feito?", "NÃO — marcar manualmente no dashboard depois de enviar"],
        ]),
      );
    }

    return new Response(JSON.stringify({ ok: true, status: newStatus }), {
      headers: CORS_HEADERS,
    });
  } catch (err) {
    console.error("reservation-respond: erro inesperado", err);
    return new Response(JSON.stringify({ error: "internal_error" }), {
      status: 500,
      headers: CORS_HEADERS,
    });
  }
});
