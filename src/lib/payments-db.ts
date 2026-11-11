// ============================================================
// SPOTTER — Pagamentos M-Pesa / e-Mola
// Parte 3 — Sistema de cobranças + webhook
// ============================================================

import { supabase, SUPABASE_CONFIGURED } from "./supabase";
import { PLANS, type PlanId } from "./subscription-storage";
import { type BoostPackageId } from "./boost-storage";
import { t } from "./i18n";

// "zumbopay" fica só para ler pagamentos antigos (histórico no /admin); já não é usado.
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
  /** "full" = 100% agora · "deposit" = sinal de 20% para garantir a reserva */
  paymentOption: "full" | "deposit";
  checkIn: string; // "YYYY-MM-DD"
  checkOut: string; // "YYYY-MM-DD" (por hora: igual ao checkIn)
  /** Pensão: "hour" = por horas (usa hours + startTime) · "night" = por dia/noites */
  bookingUnit?: "night" | "hour";
  hours?: number;
  startTime?: string; // "HH:MM"
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
  eventDate?: string; // YYYY-MM-DD (início)
  eventEndDate?: string; // YYYY-MM-DD (fim, opcional)
  city?: string;
  /** Nº de dias que o evento fica publicado (1 a 30) — 50 MZN por dia. */
  days?: number;
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
  paymentUrl?: string; // legado (ZumboPay) — já não é preenchido
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
// preço é sempre calculado no servidor (ver create-mpesa-payment) —
// usar sempre createMpesaRoomPayment/createMpesaTablePayment.
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

// ── Pagamentos M-Pesa (assinaturas, Turbinar, publicações, eventos, reservas) ──
// O comerciante/cliente indica o número M-Pesa (84/85); o servidor
// (supabase/functions/create-mpesa-payment) pede a cobrança à Vodacom e o
// telemóvel mostra o pedido de PIN. A resposta chega na própria chamada
// (confirmed / failed) ou fica "pending" — nesse caso usa checkMpesaPayment().
// supabase.functions.invoke devolve data=null quando a function responde 4xx/5xx
// e esconde a mensagem real dentro de error.context (um Response). Sem isto o
// utilizador só via "Edge Function returned a non-2xx status code".
async function invokeErrorMessage(
  data: { error?: string } | null | undefined,
  error: { message?: string; context?: unknown } | null | undefined,
  fallback: string,
): Promise<string> {
  if (data?.error) return data.error;
  try {
    const ctx = error?.context as Response | undefined;
    if (ctx && typeof ctx.json === "function") {
      const body = await ctx.json();
      if (body?.error) return String(body.error);
    }
  } catch {
    /* corpo não era JSON — usa o fallback */
  }
  return fallback;
}

export type MpesaChargeStatus = "confirmed" | "failed" | "pending";
export interface MpesaChargeResult {
  payment: PaymentRequest;
  status: MpesaChargeStatus;
  /** Mensagem pronta para mostrar ao utilizador quando status === "failed". */
  error?: string;
}

async function chargeMpesa(
  businessId: string,
  planId: PaymentPlanId,
  payerPhone: string,
  body: Record<string, unknown>,
  extra: Partial<PaymentRequest>,
  fallbackError: string,
): Promise<MpesaChargeResult> {
  if (!SUPABASE_CONFIGURED || !supabase) {
    throw new Error("O pagamento M-Pesa requer ligação ao Supabase.");
  }
  const { data, error } = await supabase.functions.invoke("create-mpesa-payment", {
    body: { businessId, planId, payerPhone, ...body },
  });
  if (error || !data?.paymentId) {
    throw new Error(await invokeErrorMessage(data, error, fallbackError));
  }
  const payment: PaymentRequest = {
    id: data.paymentId,
    businessId,
    merchantRef: data.merchantRef,
    planId,
    amount: data.amount,
    currency: "MZN",
    method: "mpesa",
    phone: payerPhone,
    status:
      data.status === "confirmed" ? "confirmed" : data.status === "failed" ? "failed" : "pending",
    createdAt: data.createdAt,
    expiresAt: data.expiresAt,
    ...extra,
  };
  localAdd(payment);
  return { payment, status: payment.status as MpesaChargeStatus, error: data.error };
}

/** Assinatura mensal (starter/pro/premium) ou Turbinar (boost). */
export function createMpesaPayment(
  businessId: string,
  planId: PaymentPlanId,
  payerPhone: string,
  boostPackageId?: BoostPackageId,
): Promise<MpesaChargeResult> {
  if (planId === "boost" && !boostPackageId) {
    throw new Error("boostPackageId é obrigatório quando planId é 'boost'.");
  }
  return chargeMpesa(
    businessId,
    planId,
    payerPhone,
    { boostPackageId },
    { boostPackageId: planId === "boost" ? (boostPackageId ?? null) : null },
    "Falha ao criar o pagamento M-Pesa.",
  );
}

/** Publicação paga no feed (só fotos). A foto já foi enviada antes (Storage). */
export function createMpesaPostPayment(
  businessId: string,
  postPackageId: PostPackageId,
  content: PostContentInput,
  payerPhone: string,
): Promise<MpesaChargeResult> {
  return chargeMpesa(
    businessId,
    "post",
    payerPhone,
    {
      postPackageId,
      contentMetadata: {
        photo_url: content.photoUrl,
        caption: content.caption ?? null,
        city: content.city ?? null,
      },
    },
    { postPackageId },
    "Falha ao criar o pagamento da publicação.",
  );
}

/** Evento (cartaz + bilhetes), 50 MZN por dia — o valor é calculado no servidor. */
export function createMpesaEventPayment(
  businessId: string,
  eventTier: EventTier,
  content: EventContentInput,
  payerPhone: string,
): Promise<MpesaChargeResult> {
  if (!content.title?.trim() || !content.posterUrl?.trim()) {
    throw new Error("Título e cartaz do evento são obrigatórios.");
  }
  return chargeMpesa(
    businessId,
    "event",
    payerPhone,
    {
      eventTier,
      eventDays: content.days ?? null,
      contentMetadata: {
        poster_url: content.posterUrl,
        title: content.title,
        ticket_phone: content.ticketPhone ?? null,
        ticket_link: content.ticketLink ?? null,
        event_date: content.eventDate ?? null,
        event_end_date: content.eventEndDate ?? null,
        city: content.city ?? null,
      },
    },
    { eventTier },
    "Falha ao criar o pagamento do evento.",
  );
}

/** Reserva de quarto. Exige sessão: o utilizador é lido no servidor a partir do token. */
export function createMpesaRoomPayment(
  businessId: string,
  input: RoomReservationInput,
  payerPhone: string,
): Promise<MpesaChargeResult> {
  return chargeMpesa(
    businessId,
    "room",
    payerPhone,
    {
      roomId: input.roomId,
      paymentOption: input.paymentOption,
      bookingUnit: input.bookingUnit ?? "night",
      hours: input.hours ?? null,
      startTime: input.startTime ?? null,
      checkIn: input.checkIn,
      checkOut: input.checkOut,
      guests: input.guests,
      specialRequest: input.specialRequest ?? null,
      clientName: input.clientName,
      clientPhone: input.clientPhone,
      clientEmail: input.clientEmail ?? null,
    },
    {},
    "Falha ao criar o pagamento da reserva de quarto.",
  );
}

/** Reserva de mesa (preço fixo do negócio, metade/metade). */
export function createMpesaTablePayment(
  businessId: string,
  input: TableReservationInput,
  payerPhone: string,
): Promise<MpesaChargeResult> {
  return chargeMpesa(
    businessId,
    "table",
    payerPhone,
    {
      reservationDate: input.reservationDate,
      timeSlot: input.timeSlot,
      guests: input.guests,
      specialRequest: input.specialRequest ?? null,
      clientName: input.clientName,
      clientPhone: input.clientPhone,
      clientEmail: input.clientEmail ?? null,
      tableTipo: input.tipo ?? "normal",
    },
    {},
    "Falha ao criar o pagamento da reserva de mesa.",
  );
}

/**
 * Pergunta ao servidor (que pergunta à M-Pesa) o estado de um pagamento que ficou
 * "pending" — ligação caída, resposta tardia. Se já foi pago, o servidor activa-o.
 */
export async function checkMpesaPayment(
  paymentId: string,
): Promise<{ status: MpesaChargeStatus; error?: string }> {
  if (!SUPABASE_CONFIGURED || !supabase) return { status: "pending" };
  const { data, error } = await supabase.functions.invoke("create-mpesa-payment", {
    body: { action: "check", paymentId },
  });
  if (error || !data?.status) return { status: "pending" }; // erro passageiro: tenta na próxima volta
  return { status: data.status, error: data.error };
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
