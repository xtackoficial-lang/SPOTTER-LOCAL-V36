// ============================================================
// XTACK SPOTTER — activa o que foi pago (código partilhado)
// ------------------------------------------------------------
// Recebe uma linha de "payments" JÁ marcada como confirmed e faz o que o
// pagamento compra: Turbinar, publicação, evento, reserva de quarto/mesa
// ou assinatura mensal. Extraído (sem alterações de lógica) de
// zumbopay-webhook para servir também o create-mpesa-payment.
// ============================================================

// @ts-nocheck — ambiente Deno (Supabase Edge Functions).
import {
  sendReservationChatMessage,
  sendReservationPush,
  sendReservationAdminEmail,
  buildReservationEmailHtml,
  responseDeadlineFrom,
  formatDeadline,
} from "./reservation-notify.ts";

export async function fulfillPayment(supabase: any, payment: any): Promise<void> {
  const now = new Date().toISOString();

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
      // Evento: cria a linha já "active". v38: o dono paga por dia (50 MZN/dia);
      // passados os dias deixa de aparecer sozinho (expires_at). Eventos pagos
      // antes da v38 não têm "days" → ficam sem expiração, como antes.
      const meta = (payment.content_metadata ?? {}) as Record<string, unknown>;
      const eventDays = Number(meta.days);
      const eventExpiresAt =
        eventDays >= 1 ? new Date(Date.now() + eventDays * 86_400_000).toISOString() : null;

      const endRaw = String(meta.event_end_date ?? meta.eventEndDate ?? "");
      const eventEndDate = /^\d{4}-\d{2}-\d{2}$/.test(endRaw) ? endRaw : null;
      const eventRow: Record<string, unknown> = {
        business_id: payment.business_id,
        poster_url: meta.poster_url ?? meta.posterUrl ?? "",
        title: meta.title ?? "Evento",
        ticket_phone: meta.ticket_phone ?? meta.ticketPhone ?? null,
        ticket_link: meta.ticket_link ?? meta.ticketLink ?? null,
        event_date: meta.event_date ?? meta.eventDate ?? null,
        event_end_date: eventEndDate,
        city: meta.city ?? null,
        tier: payment.boost_package_id ?? "standard",
        payment_id: payment.id,
        status: "active",
        expires_at: eventExpiresAt,
      };
      const evInsert = await supabase.from("events").insert(eventRow);
      // Rede de segurança: se as migrações 012/013 ainda não foram corridas, as colunas
      // novas não existem — publica na mesma (o cliente já pagou) sem elas.
      if (evInsert.error && /expires_at|event_end_date/.test(evInsert.error.message ?? "")) {
        console.warn("events: colunas novas em falta, a publicar sem elas:", evInsert.error.message);
        const { expires_at: _x, event_end_date: _y, ...legacyRow } = eventRow;
        await supabase.from("events").insert(legacyRow);
      }
    } else if (payment.plan_id === "room") {
      // Reserva de quarto: cria a linha já "pending_approval" — o
      // comerciante ainda tem de aceitar ou recusar, dentro do prazo
      // (RESPONSE_DEADLINE_HOURS). O cliente pagou 100% ou um sinal de
      // 20% (meta.paymentOption); o restante (meta.balanceDue) paga-se
      // directamente no hotel, fora da app.
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

      const deadline = responseDeadlineFrom();
      const isFull = meta.paymentOption === "full";
      const isHourly = meta.bookingUnit === "hour";
      const stayText = isHourly
        ? `${meta.checkIn} às ${meta.startTime} (${meta.hours}h)`
        : `${meta.checkIn} a ${meta.checkOut}`;
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
          booking_unit: meta.bookingUnit ?? "night",
          hours: meta.hours ?? null,
          start_time: meta.startTime ?? null,
          total_price: meta.totalPrice,
          commission_amount: meta.commissionAmount,
          payment_option: meta.paymentOption ?? "deposit",
          amount_paid: meta.amountPaid ?? payment.amount,
          balance_due: meta.balanceDue ?? 0,
          response_deadline: deadline.toISOString(),
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
          `Recebemos o seu pedido de reserva — ${meta.roomName}, ${stayText}, ${meta.guests} hóspede(s). Pagou ${meta.amountPaid} MT (${isFull ? "valor total" : "sinal de 20%"}). ${businessName} responde até ${formatDeadline(deadline)}.`,
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
          `${meta.roomName} — ${stayText} — responda até ${formatDeadline(deadline)}.`,
        );
      }
      // E-mail para xtackoficial@gmail.com
      await sendReservationAdminEmail(
        `Reserva de quarto paga — ${businessName}`,
        buildReservationEmailHtml([
          ["Negócio", businessName],
          ["Quarto", String(meta.roomName ?? "")],
          [isHourly ? "Reserva por hora" : "Check-in / Check-out", isHourly ? stayText : `${meta.checkIn} → ${meta.checkOut} (${meta.nights} noites)`],
          ["Hóspedes", String(meta.guests ?? "")],
          ["Cliente", `${meta.clientName} — ${meta.clientPhone}`],
          ["E-mail do cliente", String(meta.clientEmail ?? "—")],
          ["Valor total da estadia", `${meta.totalPrice} MT`],
          ["Opção de pagamento", isFull ? "Pagamento total (100%)" : "Sinal de 20%"],
          ["Pago agora", `${meta.amountPaid} MT`],
          ["Restante a pagar no hotel", `${meta.balanceDue} MT`],
          ["Comissão Spotter (10% do total)", `${meta.commissionAmount} MT`],
          ["A repassar ao hotel", `${Math.round((Number(meta.amountPaid) - Number(meta.commissionAmount)) * 100) / 100} MT`],
          ["Pedido especial", String(meta.specialRequest ?? "—")],
          ["Estado", `Pendente — hotel responde até ${formatDeadline(deadline)}`],
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
          "fulfillPayment: pagamento confirmado mas falhou activar o plano",
          payment.business_id, payment.plan_id, planUpdateError,
        );
      }
    }
}
