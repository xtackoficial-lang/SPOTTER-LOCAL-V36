// ============================================================
// XTACK SPOTTER — Publicações pagas (feed) e Eventos (Supabase)
// ------------------------------------------------------------
// Camada de LEITURA pública. A ESCRITA não passa por aqui — as linhas
// só são criadas pelo zumbopay-webhook depois do pagamento confirmar
// (ver create-zumbopay-payment / zumbopay-webhook + payments-db.ts
// createZumboPayPostPayment / createZumboPayEventPayment).
// ============================================================
import { supabase, SUPABASE_CONFIGURED } from "./supabase";

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
export async function fetchActiveEvents(city?: string): Promise<SpotterEvent[]> {
  if (!SUPABASE_CONFIGURED || !supabase) return [];

  let query = supabase
    .from("events")
    .select(
      "id, business_id, poster_url, title, ticket_phone, ticket_link, event_date, city, tier, created_at, businesses(business_name)",
    )
    .eq("status", "active")
    .order("tier", { ascending: true }) // "featured" < "standard" alfabeticamente — featured primeiro
    .order("event_date", { ascending: true })
    .limit(50);

  if (city) query = query.or(`city.eq.${city},city.is.null`);

  const { data, error } = await query;
  if (error || !data) {
    console.warn("fetchActiveEvents: falha ao carregar eventos", error);
    return [];
  }

  type RawEventRow = {
    id: string;
    business_id: string;
    poster_url: string;
    title: string;
    ticket_phone: string | null;
    ticket_link: string | null;
    event_date: string | null;
    city: string | null;
    tier: "standard" | "featured";
    created_at: string;
    businesses: { business_name: string } | null;
  };

  return (data as unknown as RawEventRow[]).map((row) => ({
    id: row.id,
    businessId: row.business_id,
    businessName: row.businesses?.business_name ?? "Negócio",
    posterUrl: row.poster_url,
    title: row.title,
    ticketPhone: row.ticket_phone ?? undefined,
    ticketLink: row.ticket_link ?? undefined,
    eventDate: row.event_date ?? undefined,
    city: row.city ?? undefined,
    tier: row.tier,
    createdAt: row.created_at,
  }));
}
