// ============================================================
// SPOTTER — Publicar/agendar evento (plano Pro/Premium) e ver a quota
// ------------------------------------------------------------
// Fala com as funções da migração 017 (event_quota_status e
// publish_event_scheduled). O servidor valida tudo; aqui só traduzimos
// os códigos de erro para mensagens em português.
// ============================================================
import { supabase, SUPABASE_CONFIGURED, isUuid } from "./supabase";

export interface EventQuota {
  allowed: boolean;
  limit: number;
  used: number;
  plan: string | null;
  status?: string;
}

export async function fetchEventQuota(
  businessId: string,
  publishAtIso: string,
): Promise<EventQuota | null> {
  if (!SUPABASE_CONFIGURED || !supabase || !isUuid(businessId)) return null;
  try {
    const { data, error } = await supabase.rpc("event_quota_status", {
      p_business_id: businessId,
      p_publish_at: publishAtIso,
    });
    if (error || !data) return null; // migração 017 por correr → não mostra quota
    return data as EventQuota;
  } catch {
    return null;
  }
}

export interface ScheduledEventInput {
  businessId: string;
  title: string;
  /** 1 a 10 fotos; a primeira é a capa. */
  photoUrls: string[];
  eventDate?: string;
  eventEndDate?: string;
  ticketPhone?: string;
  ticketLink?: string;
  city?: string;
  publishAt: string; // ISO com fuso de Maputo
  expiresAt: string;
}

export type PublishEventResult =
  | { ok: true; id: string; used: number; limit: number }
  | { ok: false; error: string };

const ERRORS: Record<string, string> = {
  NOT_OWNER: "Só o dono do negócio pode publicar eventos. Inicia sessão com a conta certa.",
  PLAN_REQUIRED:
    "Publicar eventos está incluído nos planos Pro e Premium (com o plano ativo). Muda de plano para continuar.",
  QUOTA_EXCEEDED:
    "Já usaste todos os eventos do teu plano neste mês. Escolhe um dia do mês seguinte.",
  BAD_TIME:
    "A data ou a hora não são válidas. Usa horas certas entre as 06:00 e as 22:00, não no passado, e deixa o evento entre 1 hora e 30 dias.",
  BAD_INPUT: "Alguns dados do evento não são válidos. Confirma o título, o contacto e as datas.",
};

export async function publishScheduledEvent(
  input: ScheduledEventInput,
): Promise<PublishEventResult> {
  if (!SUPABASE_CONFIGURED || !supabase) {
    return { ok: false, error: "Sem ligação ao servidor. Tenta mais tarde." };
  }
  if (!isUuid(input.businessId)) {
    return { ok: false, error: "Termina primeiro o registo do teu negócio para publicar eventos." };
  }
  try {
    const { data, error } = await supabase.rpc("publish_event_scheduled", {
      p_business_id: input.businessId,
      p_title: input.title,
      p_photo_urls: input.photoUrls,
      p_event_date: input.eventDate ?? null,
      p_event_end_date: input.eventEndDate ?? null,
      p_ticket_phone: input.ticketPhone ?? null,
      p_ticket_link: input.ticketLink ?? null,
      p_city: input.city ?? null,
      p_publish_at: input.publishAt,
      p_expires_at: input.expiresAt,
    });
    if (error) {
      const code = Object.keys(ERRORS).find((k) => (error.message ?? "").includes(k));
      if (code) return { ok: false, error: ERRORS[code] };
      if (/could not find the function|does not exist/i.test(error.message ?? "")) {
        return {
          ok: false,
          error:
            "A publicação de eventos ainda não está ativa no servidor (faltam as migrações 017 e 018).",
        };
      }
      console.warn("publishScheduledEvent:", error.message);
      return { ok: false, error: "Não foi possível publicar o evento. Tenta outra vez." };
    }
    const r = data as { id: string; used: number; limit: number };
    return { ok: true, id: r.id, used: r.used, limit: r.limit };
  } catch (err) {
    console.warn("publishScheduledEvent: falha.", err);
    return { ok: false, error: "Não foi possível publicar o evento. Tenta outra vez." };
  }
}
