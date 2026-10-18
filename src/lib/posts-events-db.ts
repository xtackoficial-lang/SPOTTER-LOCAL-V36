// ============================================================
// XTACK SPOTTER — Publicações pagas (feed) e Eventos (Supabase)
// ------------------------------------------------------------
// Camada de LEITURA pública. A ESCRITA não passa por aqui — as linhas
// só são criadas pelo zumbopay-webhook depois do pagamento confirmar
// (ver create-zumbopay-payment / zumbopay-webhook + payments-db.ts
// createZumboPayPostPayment / createZumboPayEventPayment).
// ============================================================
import { supabase, SUPABASE_CONFIGURED, isUuid } from "./supabase";

export interface BusinessPost {
  id: string;
  businessId: string;
  businessName: string;
  photoUrl: string;
  caption?: string;
  city?: string;
  createdAt: string;
  expiresAt: string;
}

export interface SpotterEvent {
  id: string;
  businessId: string;
  businessName: string;
  posterUrl: string;
  title: string;
  ticketPhone?: string;
  ticketLink?: string;
  eventDate?: string;
  /** Último dia do evento (opcional). Sem isto, o evento acaba no dia do início. */
  eventEndDate?: string;
  /** Quando termina o período pago de publicação. */
  expiresAt?: string;
  city?: string;
  tier: "standard" | "featured";
  createdAt: string;
}

/**
 * Publicações activas do feed, mais recentes primeiro. Se `city` for
 * dado, mostra só as publicações dessa cidade — mas nunca filtra por
 * omissão (uma publicação sem cidade escolhida aparece para todos).
 */
export async function fetchActivePosts(city?: string): Promise<BusinessPost[]> {
  if (!SUPABASE_CONFIGURED || !supabase) return [];

  let query = supabase
    .from("business_posts")
    .select(
      "id, business_id, photo_url, caption, city, created_at, expires_at, businesses(business_name)",
    )
    .eq("status", "active")
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false })
    .limit(30);

  if (city) query = query.or(`city.eq.${city},city.is.null`);

  const { data, error } = await query;
  if (error || !data) {
    console.warn("fetchActivePosts: falha ao carregar publicações", error);
    return [];
  }

  type RawPostRow = {
    id: string;
    business_id: string;
    photo_url: string;
    caption: string | null;
    city: string | null;
    created_at: string;
    expires_at: string;
    businesses: { business_name: string } | null;
  };

  return (data as unknown as RawPostRow[]).map((row) => ({
    id: row.id,
    businessId: row.business_id,
    businessName: row.businesses?.business_name ?? "Negócio",
    photoUrl: row.photo_url,
    caption: row.caption ?? undefined,
    city: row.city ?? undefined,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
  }));
}

/**
 * Eventos activos — destacados ("featured") primeiro, depois por data
 * do evento mais próxima. Mesmo filtro opcional de cidade que os posts.
 */
const EVENT_COLS_BASE =
  "id, business_id, poster_url, title, ticket_phone, ticket_link, event_date, city, tier, created_at, businesses(business_name)";
const EVENT_COLS_FULL =
  "id, business_id, poster_url, title, ticket_phone, ticket_link, event_date, event_end_date, expires_at, city, tier, created_at, businesses(business_name)";

/** Hoje (data local) em "YYYY-MM-DD". */
export function todayLocalISO(): string {
  return new Date(Date.now() - new Date().getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
}

/** "12/10/2026" ou "12/10/2026 → 14/10/2026" (vazio se não houver datas). */
export function formatEventDates(startDate?: string | null, endDate?: string | null): string {
  const fmt = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString("pt-MZ");
  if (startDate && endDate && endDate !== startDate) return `${fmt(startDate)} → ${fmt(endDate)}`;
  if (startDate) return fmt(startDate);
  if (endDate) return `até ${fmt(endDate)}`;
  return "";
}

type RawEventRow = {
  id: string;
  business_id: string;
  poster_url: string;
  title: string;
  ticket_phone: string | null;
  ticket_link: string | null;
  event_date: string | null;
  event_end_date?: string | null;
  expires_at?: string | null;
  city: string | null;
  tier: "standard" | "featured";
  created_at: string;
  businesses: { business_name: string } | null;
};

export async function fetchActiveEvents(city?: string): Promise<SpotterEvent[]> {
  if (!SUPABASE_CONFIGURED || !supabase) return [];
  const client = supabase;

  const run = (full: boolean) => {
    let query = client
      .from("events")
      .select(full ? EVENT_COLS_FULL : EVENT_COLS_BASE)
      .eq("status", "active");
    if (full) query = query.or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`);
    query = query
      .order("tier", { ascending: true }) // "featured" < "standard" alfabeticamente — featured primeiro
      .order("event_date", { ascending: true })
      .limit(50);
    if (city) query = query.or(`city.eq.${city},city.is.null`);
    return query;
  };

  // Se as migrações 012/013 ainda não foram corridas, as colunas novas não existem:
  // cai para a pesquisa antiga em vez de mostrar a aba vazia.
  let { data, error } = await run(true);
  if (error) ({ data, error } = await run(false));
  if (error || !data) {
    console.warn("fetchActiveEvents: falha ao carregar eventos", error);
    return [];
  }

  const today = todayLocalISO();
  const nowMs = Date.now();
  return (data as unknown as RawEventRow[])
    .map((row) => ({
      id: row.id,
      businessId: row.business_id,
      businessName: row.businesses?.business_name ?? "Negócio",
      posterUrl: row.poster_url,
      title: row.title,
      ticketPhone: row.ticket_phone ?? undefined,
      ticketLink: row.ticket_link ?? undefined,
      eventDate: row.event_date ?? undefined,
      eventEndDate: row.event_end_date ?? undefined,
      expiresAt: row.expires_at ?? undefined,
      city: row.city ?? undefined,
      tier: row.tier,
      createdAt: row.created_at,
    }))
    .filter((ev) => {
      // Esconde eventos que já terminaram ou cujos dias pagos acabaram.
      const lastDay = ev.eventEndDate ?? ev.eventDate;
      if (lastDay && lastDay < today) return false;
      if (ev.expiresAt && Date.parse(ev.expiresAt) <= nowMs) return false;
      return true;
    });
}

// ---------- Os eventos do próprio comerciante (gestão) ----------
export interface MyEvent {
  id: string;
  title: string;
  posterUrl: string;
  ticketPhone?: string;
  ticketLink?: string;
  city?: string;
  eventDate?: string;
  eventEndDate?: string;
  status: "pending" | "active" | "expired";
  expiresAt?: string;
  createdAt: string;
}

export async function fetchMyEvents(businessId: string): Promise<MyEvent[]> {
  if (!SUPABASE_CONFIGURED || !supabase || !isUuid(businessId)) return [];
  const client = supabase;
  const run = (cols: string) =>
    client
      .from("events")
      .select(cols)
      .eq("business_id", businessId)
      .order("created_at", { ascending: false })
      .limit(20);
  const base =
    "id, title, poster_url, ticket_phone, ticket_link, city, event_date, status, created_at";
  let { data, error } = await run(`${base}, event_end_date, expires_at`);
  if (error) ({ data, error } = await run(base));
  if (error || !data) return [];
  type Row = {
    id: string;
    title: string;
    poster_url: string;
    ticket_phone: string | null;
    ticket_link: string | null;
    city: string | null;
    event_date: string | null;
    event_end_date?: string | null;
    expires_at?: string | null;
    status: "pending" | "active" | "expired";
    created_at: string;
  };
  return (data as unknown as Row[]).map((r) => ({
    id: r.id,
    title: r.title,
    posterUrl: r.poster_url,
    ticketPhone: r.ticket_phone ?? undefined,
    ticketLink: r.ticket_link ?? undefined,
    city: r.city ?? undefined,
    eventDate: r.event_date ?? undefined,
    eventEndDate: r.event_end_date ?? undefined,
    status: r.status,
    expiresAt: r.expires_at ?? undefined,
    createdAt: r.created_at,
  }));
}

/** Remove um evento do próprio comerciante (a política da BD só deixa apagar os teus). */
export async function deleteMyEvent(eventId: string): Promise<boolean> {
  if (!SUPABASE_CONFIGURED || !supabase) return false;
  // A política de segurança (RLS) não dá erro quando bloqueia: devolve 0 linhas.
  // Por isso só damos como removido se a linha foi mesmo apagada.
  const { data, error } = await supabase.from("events").delete().eq("id", eventId).select("id");
  return !error && (data?.length ?? 0) > 0;
}
