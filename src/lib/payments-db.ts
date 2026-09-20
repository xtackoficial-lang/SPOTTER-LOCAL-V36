// ============================================================
// SPOTTER — Pagamentos M-Pesa / e-Mola
// Parte 3 — Sistema de cobranças + webhook
// ============================================================

import { supabase, SUPABASE_CONFIGURED } from "./supabase";
import { PLANS, type PlanId } from "./subscription-storage";
import { type BoostPackageId } from "./boost-storage";
import { t } from "./i18n";

export type PaymentMethod = "mpesa" | "emola" | "manual" | "zumbopay";
export type PaymentStatus = "pending" | "confirmed" | "failed" | "expired";
export type PostPackageId = "24h" | "3d" | "7d";
export type EventTier = "standard" | "featured";
// "boost" é um pseudo-plano: pagamento único de destaque (1/7/30 dias),
// não uma subscrição mensal — mas reaproveita a mesma tabela/fluxo.
// "post" e "event" seguem o mesmo padrão: pagamento único ligado a
// conteúdo (foto/cartaz) que só é criado depois de o pagamento confirmar.
// "room"/"table" seguem o mesmo padrão para reservas — ver reservations-db.ts.
export type PaymentPlanId = PlanId | "boost" | "post" | "event" | "room" | "table";

export interface RoomReservationInput {
  roomId: string;
  checkIn: string; // "YYYY-MM-DD"
  checkOut: string; // "YYYY-MM-DD"
  guests: number;
  specialRequest?: string;
  clientName: string;
  clientPhone: string;
  clientEmail?: string;
}

export interface TableReservationInput {
  reservationDate: string; // "YYYY-MM-DD"
  timeSlot: string;
  guests: number;
  specialRequest?: string;
  clientName: string;
  clientPhone: string;
  clientEmail?: string;
  tipo?: "normal" | "evento";
}

export interface PostContentInput {
  photoUrl: string;
  caption?: string;
  city?: string;
}

export interface EventContentInput {
  posterUrl: string;
  title: string;
  ticketPhone?: string;
  ticketLink?: string;
  eventDate?: string; // YYYY-MM-DD
  city?: string;
}

export interface PaymentRequest {
  id: string;
  businessId: string;
  merchantRef: string; // referência única para o operador
  planId: PaymentPlanId;
  boostPackageId?: BoostPackageId | null; // só relevante quando planId === "boost"
  postPackageId?: PostPackageId | null; // só relevante quando planId === "post"
  eventTier?: EventTier | null; // só relevante quando planId === "event"
  amount: number;
  currency: "MZN";
  method: PaymentMethod;
  phone?: string; // número M-Pesa/e-Mola
  status: PaymentStatus;
  operatorRef?: string; // ref devolvida pelo M-Pesa/e-Mola
  confirmedAt?: string;
  failReason?: string;
  createdAt: string;
  expiresAt: string; // expira em 10 minutos
  paymentUrl?: string; // só para method === "zumbopay" — link para onde redirecionar
}

// ── Preços dos planos mensais (MZN) — derivados da fonte única em subscription-storage.ts ──
// O preço do "boost" não está aqui porque varia por pacote (1/7/30 dias)
// — ver boostPackagePrice() em boost-storage.ts, passado directamente
// a createPaymentRequest() via overrideAmount.
export const PLAN_PRICES: Record<PlanId, number> = PLANS.reduce(
  (acc, p) => ({ ...acc, [p.id]: p.price }),
  {} as Record<PlanId, number>,
);

// ── Referência única de pagamento ────────────────────────────
function makeRef(businessId: string, planId: string): string {
  const ts = Date.now().toString(36).toUpperCase();
  const bid = businessId.slice(0, 6).toUpperCase();
  return `XL-${bid}-${planId.slice(0, 2).toUpperCase()}-${ts}`;
}

// ── LocalStorage fallback ─────────────────────────────────────
const LOCAL_KEY = "xlocal.payments.v1";

function localRead(): PaymentRequest[] {
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}
function localWrite(data: PaymentRequest[]) {
  try {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(data));
  } catch {
    /* ignorado: falha de quota/acesso ao localStorage */
  }
}
function localAdd(p: PaymentRequest): PaymentRequest[] {
  const all = [...localRead(), p];
  localWrite(all);
  return all;
}
function localUpdate(id: string, patch: Partial<PaymentRequest>): PaymentRequest[] {
  const all = localRead().map((p) => (p.id === id ? { ...p, ...patch } : p));
  localWrite(all);
  return all;
}

// ── Criar pedido de pagamento ────────────────────────────────
// Para planos mensais (starter/pro/premium), o valor vem de PLAN_PRICES.
// Para "boost"/"post"/"event", o valor depende do pacote escolhido e tem
// de ser passado explicitamente em opts.amount — não há valor único fixo.
// "room"/"table" NUNCA passam por aqui: exigem sessão autenticada e o
// preço é sempre calculado no servidor (ver create-zumbopay-payment) —
// usar sempre createZumboPayRoomPayment/createZumboPayTablePayment.
export async function createPaymentRequest(
  businessId: string,
  planId: Exclude<PaymentPlanId, "room" | "table">,
  method: PaymentMethod,
  phone?: string,
  opts?: { amount?: number; boostPackageId?: BoostPackageId },
): Promise<PaymentRequest> {
  const now = new Date();
  const expires = new Date(now.getTime() + 10 * 60 * 1000); // 10 min
  const amount =
    planId === "boost" || planId === "post" || planId === "event"
      ? (opts?.amount ?? 0)
      : PLAN_PRICES[planId];

  const req: PaymentRequest = {
    id: crypto.randomUUID(),
    businessId,
    merchantRef: makeRef(businessId, planId),
    planId,
    boostPackageId: planId === "boost" ? (opts?.boostPackageId ?? null) : null,
    amount,
    currency: "MZN",
    method,
    phone,
    status: "pending",
    createdAt: now.toISOString(),
    expiresAt: expires.toISOString(),
  };

  if (SUPABASE_CONFIGURED && supabase) {
    try {
      const { error } = await supabase.from("payments").insert({
        id: req.id,
        business_id: req.businessId,
        merchant_ref: req.merchantRef,
        plan_id: req.planId,
        boost_package_id: req.boostPackageId,
        amount: req.amount,
        currency: req.currency,
        method: req.method,
        phone: req.phone,
        status: req.status,
        created_at: req.createdAt,
        expires_at: req.expiresAt,
      });
      if (error) console.warn("Supabase payment insert:", error.message);
    } catch (err) {
      console.warn(
        "createPaymentRequest: Supabase indisponível, a continuar apenas localmente.",
        err,
      );
    }
  }

  localAdd(req);
  return req;
}

// ── Criar pagamento via ZumboPay (assinaturas starter/pro/premium E
// Turbinar/boost) ──
// Ao contrário de createPaymentRequest (mpesa/emola/manual), aqui não é
// dado nenhum código USSD — o comerciante é redirecionado para o link
// de pagamento hospedado pela própria ZumboPay. A confirmação acontece
// sozinha via webhook (ver supabase/functions/zumbopay-webhook), sem
// precisar do admin confirmar manualmente.
export async function createZumboPayPayment(
  businessId: string,
  planId: PaymentPlanId,
  boostPackageId?: BoostPackageId,
): Promise<{ payment: PaymentRequest; paymentUrl: string }> {
  if (!SUPABASE_CONFIGURED || !supabase) {
    throw new Error("Pagamento via ZumboPay requer ligação ao Supabase.");
  }
  if (planId === "boost" && !boostPackageId) {
    throw new Error("boostPackageId é obrigatório quando planId é 'boost'.");
  }

  const { data, error } = await supabase.functions.invoke("create-zumbopay-payment", {
    body: { businessId, planId, boostPackageId },
  });

  if (error || !data?.paymentUrl) {
    throw new Error(
      (data && data.error) || error?.message || "Falha ao criar o pagamento na ZumboPay.",
    );
  }

  const payment: PaymentRequest = {
    id: data.paymentId,
    businessId,
    merchantRef: data.merchantRef,
    planId,
    boostPackageId: planId === "boost" ? (boostPackageId ?? null) : null,
    amount: data.amount,
    currency: "MZN",
    method: "zumbopay",
    status: "pending",
    createdAt: data.createdAt,
    expiresAt: data.expiresAt,
    paymentUrl: data.paymentUrl,
  };

  localAdd(payment);
  return { payment, paymentUrl: data.paymentUrl };
}

// ── Criar pagamento de Publicação no feed (Ideia 1 — só fotos) ──
// O comerciante já fez upload da foto antes (Storage) e escolhe a
// cidade onde quer que apareça — pode ser diferente da cidade do
// próprio negócio (ex: quer anunciar em Maputo mesmo estando em Tofo).
export async function createZumboPayPostPayment(
  businessId: string,
  postPackageId: PostPackageId,
  content: PostContentInput,
): Promise<{ payment: PaymentRequest; paymentUrl: string }> {
  if (!SUPABASE_CONFIGURED || !supabase) {
    throw new Error("Publicação via ZumboPay requer ligação ao Supabase.");
  }

  const { data, error } = await supabase.functions.invoke("create-zumbopay-payment", {
    body: {
      businessId,
      planId: "post",
      postPackageId,
      contentMetadata: {
        photo_url: content.photoUrl,
        caption: content.caption ?? null,
        city: content.city ?? null,
      },
    },
  });

  if (error || !data?.paymentUrl) {
    throw new Error(
      (data && data.error) || error?.message || "Falha ao criar o pagamento da publicação.",
    );
  }

  const payment: PaymentRequest = {
    id: data.paymentId,
    businessId,
    merchantRef: data.merchantRef,
    planId: "post",
    postPackageId,
    amount: data.amount,
    currency: "MZN",
    method: "zumbopay",
    status: "pending",
    createdAt: data.createdAt,
    expiresAt: data.expiresAt,
    paymentUrl: data.paymentUrl,
  };

  localAdd(payment);
  return { payment, paymentUrl: data.paymentUrl };
}

// ── Criar pagamento de Evento (Ideia 2 — cartaz + bilhetes) ──
// Exige conta comercial (businessId) — sem convidados, tal como o
// Turbinar e as assinaturas. tier "featured" custa mais e aparece
// no topo da aba Eventos.
export async function createZumboPayEventPayment(
  businessId: string,
  eventTier: EventTier,
  content: EventContentInput,
): Promise<{ payment: PaymentRequest; paymentUrl: string }> {
  if (!SUPABASE_CONFIGURED || !supabase) {
    throw new Error("Publicação de evento via ZumboPay requer ligação ao Supabase.");
  }
  if (!content.title?.trim() || !content.posterUrl?.trim()) {
    throw new Error("Título e cartaz do evento são obrigatórios.");
  }

  const { data, error } = await supabase.functions.invoke("create-zumbopay-payment", {
    body: {
      businessId,
      planId: "event",
      eventTier,
      contentMetadata: {
        poster_url: content.posterUrl,
        title: content.title,
        ticket_phone: content.ticketPhone ?? null,
        ticket_link: content.ticketLink ?? null,
        event_date: content.eventDate ?? null,
        city: content.city ?? null,
      },
    },
  });

  if (error || !data?.paymentUrl) {
    throw new Error(
      (data && data.error) || error?.message || "Falha ao criar o pagamento do evento.",
    );
  }

  const payment: PaymentRequest = {
    id: data.paymentId,
    businessId,
    merchantRef: data.merchantRef,
    planId: "event",
    eventTier,
    amount: data.amount,
    currency: "MZN",
    method: "zumbopay",
    status: "pending",
    createdAt: data.createdAt,
    expiresAt: data.expiresAt,
    paymentUrl: data.paymentUrl,
  };

  localAdd(payment);
  return { payment, paymentUrl: data.paymentUrl };
}

// ── Criar pagamento de reserva de Quarto (comissão 10% da estadia) ──
// Exige sessão autenticada — o utilizador (auth.uid) é lido no servidor
// a partir do token, nunca confiado a partir do corpo do pedido.
export async function createZumboPayRoomPayment(
  businessId: string,
  input: RoomReservationInput,
): Promise<{ payment: PaymentRequest; paymentUrl: string }> {
  if (!SUPABASE_CONFIGURED || !supabase) {
    throw new Error("Reserva de quarto via ZumboPay requer ligação ao Supabase.");
  }

  const { data, error } = await supabase.functions.invoke("create-zumbopay-payment", {
    body: {
      businessId,
      planId: "room",
      roomId: input.roomId,
      checkIn: input.checkIn,
      checkOut: input.checkOut,
      guests: input.guests,
      specialRequest: input.specialRequest ?? null,
      clientName: input.clientName,
      clientPhone: input.clientPhone,
      clientEmail: input.clientEmail ?? null,
    },
  });

  if (error || !data?.paymentUrl) {
    throw new Error(
      (data && data.error) || error?.message || "Falha ao criar o pagamento da reserva de quarto.",
    );
  }

  const payment: PaymentRequest = {
    id: data.paymentId,
    businessId,
    merchantRef: data.merchantRef,
    planId: "room",
    amount: data.amount,
    currency: "MZN",
    method: "zumbopay",
    status: "pending",
    createdAt: data.createdAt,
    expiresAt: data.expiresAt,
    paymentUrl: data.paymentUrl,
  };

  localAdd(payment);
  return { payment, paymentUrl: data.paymentUrl };
}

// ── Criar pagamento de reserva de Mesa (preço fixo, metade/metade) ──
export async function createZumboPayTablePayment(
  businessId: string,
  input: TableReservationInput,
): Promise<{ payment: PaymentRequest; paymentUrl: string }> {
  if (!SUPABASE_CONFIGURED || !supabase) {
    throw new Error("Reserva de mesa via ZumboPay requer ligação ao Supabase.");
  }

  const { data, error } = await supabase.functions.invoke("create-zumbopay-payment", {
    body: {
      businessId,
      planId: "table",
      reservationDate: input.reservationDate,
      timeSlot: input.timeSlot,
      guests: input.guests,
      specialRequest: input.specialRequest ?? null,
      clientName: input.clientName,
      clientPhone: input.clientPhone,
      clientEmail: input.clientEmail ?? null,
      tableTipo: input.tipo ?? "normal",
    },
  });

  if (error || !data?.paymentUrl) {
    throw new Error(
      (data && data.error) || error?.message || "Falha ao criar o pagamento da reserva de mesa.",
    );
  }

  const payment: PaymentRequest = {
    id: data.paymentId,
    businessId,
    merchantRef: data.merchantRef,
    planId: "table",
    amount: data.amount,
    currency: "MZN",
    method: "zumbopay",
    status: "pending",
    createdAt: data.createdAt,
    expiresAt: data.expiresAt,
    paymentUrl: data.paymentUrl,
  };

  localAdd(payment);
  return { payment, paymentUrl: data.paymentUrl };
}

// ── Confirmar pagamento (via webhook ou admin) ───────────────
export async function confirmPayment(
  paymentId: string,
  operatorRef: string,
): Promise<PaymentRequest | null> {
  const now = new Date().toISOString();
  const patch: Partial<PaymentRequest> = {
    status: "confirmed",
    operatorRef,
    confirmedAt: now,
  };

  if (SUPABASE_CONFIGURED && supabase) {
    try {
      await supabase
        .from("payments")
        .update({ status: "confirmed", operator_ref: operatorRef, confirmed_at: now })
        .eq("id", paymentId);

      // Activar subscrição do negócio — apenas para planos reais
      // (starter/pro/premium). "boost" é um destaque temporário e não
      // deve alterar o plano de subscrição do negócio.
      const all = localRead();
      const p = all.find((x) => x.id === paymentId);
      if (p && p.planId !== "boost") {
        const renewsAt = new Date();
        renewsAt.setMonth(renewsAt.getMonth() + 1);
        await supabase
          .from("businesses")
          .update({
            plan_status: "active",
            plan_id: p.planId,
            last_payment_at: now,
            plan_renews_at: renewsAt.toISOString(),
          })
          .eq("id", p.businessId);
      }
    } catch (err) {
      // A confirmação local abaixo continua a acontecer mesmo se a
      // sincronização com o Supabase falhar — não deve aparecer como
      // "pagamento falhado" ao utilizador quando o pagamento foi confirmado.
      console.warn(
        "confirmPayment: falha ao sincronizar com Supabase, confirmado apenas localmente.",
        err,
      );
    }
  }

  localUpdate(paymentId, patch);
  const updated = localRead().find((x) => x.id === paymentId) ?? null;
  return updated;
}

// ── Marcar pagamento como falhado ────────────────────────────
export async function failPayment(paymentId: string, reason: string): Promise<void> {
  const patch: Partial<PaymentRequest> = { status: "failed", failReason: reason };
  if (SUPABASE_CONFIGURED && supabase) {
    try {
      await supabase
        .from("payments")
        .update({ status: "failed", fail_reason: reason })
        .eq("id", paymentId);
    } catch (err) {
      console.warn("failPayment: Supabase indisponível, marcado apenas localmente.", err);
    }
  }
  localUpdate(paymentId, patch);
}

// ── Buscar pagamentos de um negócio ─────────────────────────
export async function getBusinessPayments(businessId: string): Promise<PaymentRequest[]> {
  if (SUPABASE_CONFIGURED && supabase) {
    try {
      const { data, error } = await supabase
        .from("payments")
        .select("*")
        .eq("business_id", businessId)
        .order("created_at", { ascending: false })
        .limit(20);
      // Consulta bem-sucedida (mesmo sem registos) é a fonte de verdade —
      // devolve já aqui, em vez de cair para o localStorage deste
      // dispositivo, que pode estar vazio ou desatualizado se o
      // comerciante pagou a partir de outro telemóvel/navegador.
      if (!error && data) {
        return data.map((r) => ({
          id: r.id,
          businessId: r.business_id,
          merchantRef: r.merchant_ref,
          planId: r.plan_id,
          amount: r.amount,
          currency: r.currency,
          method: r.method,
          phone: r.phone,
          status: r.status,
          operatorRef: r.operator_ref,
          confirmedAt: r.confirmed_at,
          failReason: r.fail_reason,
          createdAt: r.created_at,
          expiresAt: r.expires_at,
        }));
      }
    } catch (err) {
      console.warn("getBusinessPayments: Supabase indisponível, a usar dados locais.", err);
    }
  }
  return localRead().filter((p) => p.businessId === businessId);
}

// ── Verificar se um pedido expirou ──────────────────────────
export function isExpired(req: PaymentRequest): boolean {
  return req.status === "pending" && new Date() > new Date(req.expiresAt);
}

// ── Instruções de pagamento por método ──────────────────────
export interface PaymentInstructions {
  method: PaymentMethod;
  steps: string[];
  ussdCode?: string;
  reference: string;
  amount: number;
}

export function getPaymentInstructions(req: PaymentRequest): PaymentInstructions {
  if (req.method === "mpesa") {
    return {
      method: "mpesa",
      reference: req.merchantRef,
      amount: req.amount,
      ussdCode: `*150*00#`,
      steps: [
        t("mpesaUssdStep1"),
        t("mpesaUssdStep2"),
        `${t("companyLabel")}: XTACK OFICIAL`,
        `${t("referenceLabel")}: ${req.merchantRef}`,
        `${t("valueLabel")}: ${req.amount} MZN`,
        t("confirmWithMpesaPin"),
      ],
    };
  }
  if (req.method === "emola") {
    return {
      method: "emola",
      reference: req.merchantRef,
      amount: req.amount,
      ussdCode: `*800#`,
      steps: [
        t("emolaUssdStep1"),
        t("emolaUssdStep2"),
        `${t("companyLabel")}: XTACK OFICIAL`,
        `${t("referenceLabel")}: ${req.merchantRef}`,
        `${t("valueLabel")}: ${req.amount} MZN`,
        t("confirmWithEmolaPin"),
      ],
    };
  }
  return {
    method: "manual",
    reference: req.merchantRef,
    amount: req.amount,
    steps: [
      t("bankLabel"),
      `NIB: 0008 0000 00000000 157 09`,
      t("accountHolderManual"),
      `${t("valueLabel")}: ${req.amount} MZN`,
      `${t("referenceLabel")}: ${req.merchantRef}`,
      t("afterTransferWhatsapp"),
    ],
  };
}
