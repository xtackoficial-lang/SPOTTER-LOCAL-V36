// ============================================================
// SPOTTER — Reservas (quartos de hotel e mesas de restaurante)
// ============================================================
import { supabase, SUPABASE_CONFIGURED } from "./supabase";

export interface BusinessRoom {
  id: string;
  businessId: string;
  name: string;
  capacity: number;
  pricePerNight: number;
  photoUrl: string | null;
  active: boolean;
  occupiedUntil: string | null; // "YYYY-MM-DD" ou null (disponível)
  createdAt: string;
}

export type RoomReservationStatus =
  | "pending_payment"
  | "pending_approval"
  | "confirmed"
  | "rejected"
  | "cancelled";

export interface RoomReservation {
  id: string;
  businessId: string;
  roomId: string;
  roomName?: string; // preenchido via join, quando disponível
  clientUserId: string;
  clientName: string;
  clientPhone: string;
  clientEmail: string | null;
  checkIn: string;
  checkOut: string;
  guests: number;
  specialRequest: string | null;
  nights: number;
  totalPrice: number;
  commissionAmount: number;
  status: RoomReservationStatus;
  rejectionReason: string | null;
  refunded: boolean;
  createdAt: string;
}

export type TableReservationStatus = "pending_payment" | "confirmed" | "cancelled";

export interface TableReservation {
  id: string;
  businessId: string;
  clientUserId: string;
  clientName: string;
  clientPhone: string;
  clientEmail: string | null;
  reservationDate: string;
  timeSlot: string;
  guests: number;
  specialRequest: string | null;
  tipo: "normal" | "evento";
  price: number;
  commissionAmount: number;
  payoutAmount: number;
  status: TableReservationStatus;
  repassado: boolean;
  createdAt: string;
}

// Motivos de recusa — o comerciante escolhe um antes de conseguir
// recusar um pedido de quarto (decidido: "deve clicar em um motivo").
export const ROOM_REJECTION_REASONS = [
  "Sem disponibilidade nessa data",
  "Dados da reserva incompletos ou incorretos",
  "Fora da capacidade/tipo de quarto pedido",
  "Outro motivo",
] as const;

interface BusinessRoomRow {
  id: string;
  business_id: string;
  name: string;
  capacity: number;
  price_per_night: number;
  photo_url: string | null;
  active: boolean;
  occupied_until: string | null;
  created_at: string;
}

interface RoomReservationRow {
  id: string;
  business_id: string;
  room_id: string;
  business_rooms?: { name: string } | null;
  client_user_id: string;
  client_name: string;
  client_phone: string;
  client_email: string | null;
  check_in: string;
  check_out: string;
  guests: number;
  special_request: string | null;
  nights: number;
  total_price: number;
  commission_amount: number;
  status: RoomReservationStatus;
  rejection_reason: string | null;
  refunded: boolean;
  created_at: string;
}

interface TableReservationRow {
  id: string;
  business_id: string;
  client_user_id: string;
  client_name: string;
  client_phone: string;
  client_email: string | null;
  reservation_date: string;
  time_slot: string;
  guests: number;
  special_request: string | null;
  tipo: "normal" | "evento";
  price: number;
  commission_amount: number;
  payout_amount: number;
  status: TableReservationStatus;
  repassado: boolean;
  created_at: string;
}

function mapRoom(row: BusinessRoomRow): BusinessRoom {
  return {
    id: row.id,
    businessId: row.business_id,
    name: row.name,
    capacity: row.capacity,
    pricePerNight: row.price_per_night,
    photoUrl: row.photo_url ?? null,
    active: row.active,
    occupiedUntil: row.occupied_until ?? null,
    createdAt: row.created_at,
  };
}

function mapRoomReservation(row: RoomReservationRow): RoomReservation {
  return {
    id: row.id,
    businessId: row.business_id,
    roomId: row.room_id,
    roomName: row.business_rooms?.name,
    clientUserId: row.client_user_id,
    clientName: row.client_name,
    clientPhone: row.client_phone,
    clientEmail: row.client_email ?? null,
    checkIn: row.check_in,
    checkOut: row.check_out,
    guests: row.guests,
    specialRequest: row.special_request ?? null,
    nights: row.nights,
    totalPrice: row.total_price,
    commissionAmount: row.commission_amount,
    status: row.status,
    rejectionReason: row.rejection_reason ?? null,
    refunded: row.refunded,
    createdAt: row.created_at,
  };
}

function mapTableReservation(row: TableReservationRow): TableReservation {
  return {
    id: row.id,
    businessId: row.business_id,
    clientUserId: row.client_user_id,
    clientName: row.client_name,
    clientPhone: row.client_phone,
    clientEmail: row.client_email ?? null,
    reservationDate: row.reservation_date,
    timeSlot: row.time_slot,
    guests: row.guests,
    specialRequest: row.special_request ?? null,
    tipo: row.tipo,
    price: row.price,
    commissionAmount: row.commission_amount,
    payoutAmount: row.payout_amount,
    status: row.status,
    repassado: row.repassado,
    createdAt: row.created_at,
  };
}

// ---------- Quartos: leitura pública (cliente a reservar) ----------
export async function fetchActiveRooms(businessId: string): Promise<BusinessRoom[]> {
  if (!SUPABASE_CONFIGURED || !supabase) return [];
  const { data, error } = await supabase
    .from("business_rooms")
    .select("*")
    .eq("business_id", businessId)
    .eq("active", true)
    .order("price_per_night", { ascending: true });
  if (error || !data) return [];
  return data.map(mapRoom);
}

// ---------- Quartos: gestão pelo comerciante (inclui inativos) ----------
export async function fetchAllRoomsForBusiness(businessId: string): Promise<BusinessRoom[]> {
  if (!SUPABASE_CONFIGURED || !supabase) return [];
  const { data, error } = await supabase
    .from("business_rooms")
    .select("*")
    .eq("business_id", businessId)
    .order("created_at", { ascending: false });
  if (error || !data) return [];
  return data.map(mapRoom);
}

export async function createRoom(
  businessId: string,
  room: { name: string; capacity: number; pricePerNight: number; photoUrl?: string | null },
): Promise<BusinessRoom | null> {
  if (!SUPABASE_CONFIGURED || !supabase) return null;
  const { data, error } = await supabase
    .from("business_rooms")
    .insert({
      business_id: businessId,
      name: room.name,
      capacity: room.capacity,
      price_per_night: room.pricePerNight,
      photo_url: room.photoUrl ?? null,
    })
    .select()
    .single();
  if (error || !data) return null;
  return mapRoom(data);
}

export async function updateRoom(
  roomId: string,
  patch: Partial<{
    name: string;
    capacity: number;
    pricePerNight: number;
    photoUrl: string | null;
  }>,
): Promise<void> {
  if (!SUPABASE_CONFIGURED || !supabase) return;
  const dbPatch: Record<string, unknown> = {};
  if (patch.name !== undefined) dbPatch.name = patch.name;
  if (patch.capacity !== undefined) dbPatch.capacity = patch.capacity;
  if (patch.pricePerNight !== undefined) dbPatch.price_per_night = patch.pricePerNight;
  if (patch.photoUrl !== undefined) dbPatch.photo_url = patch.photoUrl;
  await supabase.from("business_rooms").update(dbPatch).eq("id", roomId);
}

// Liga/desliga o quarto (deixa de aparecer como opção de reserva).
export async function setRoomActive(roomId: string, active: boolean): Promise<void> {
  if (!SUPABASE_CONFIGURED || !supabase) return;
  await supabase.from("business_rooms").update({ active }).eq("id", roomId);
}

// Marca "Ocupado até [data]" — null limpa (fica Disponível já).
// A reativação quando a data passa é automática (ver reactivate-rooms,
// função agendada), mas o comerciante também pode limpar manualmente
// antes disso se, por exemplo, o hóspede saiu mais cedo.
export async function setRoomOccupiedUntil(roomId: string, date: string | null): Promise<void> {
  if (!SUPABASE_CONFIGURED || !supabase) return;
  await supabase.from("business_rooms").update({ occupied_until: date }).eq("id", roomId);
}

// ---------- Pedidos de reserva de quarto (dashboard do comerciante) ----------
export async function fetchRoomReservationsForBusiness(
  businessId: string,
): Promise<RoomReservation[]> {
  if (!SUPABASE_CONFIGURED || !supabase) return [];
  const { data, error } = await supabase
    .from("room_reservations")
    .select("*, business_rooms(name)")
    .eq("business_id", businessId)
    .order("created_at", { ascending: false });
  if (error || !data) return [];
  return data.map(mapRoomReservation);
}

// Aceitar/recusar — chama a Edge Function (nunca faz update directo à
// tabela do lado do cliente, porque precisa de disparar chat/push/e-mail).
export async function respondToRoomReservation(
  reservationId: string,
  action: "accept" | "reject",
  reason?: string,
): Promise<{ ok: boolean; error?: string }> {
  if (!SUPABASE_CONFIGURED || !supabase) return { ok: false, error: "Supabase não configurado" };
  const { data, error } = await supabase.functions.invoke("reservation-respond", {
    body: { reservationId, action, reason },
  });
  if (error || data?.error) {
    return { ok: false, error: data?.error || error?.message || "Falha ao responder à reserva" };
  }
  return { ok: true };
}

// Marca que já enviaste o reembolso manual (M-Pesa/e-Mola) ao cliente.
export async function markRoomReservationRefunded(reservationId: string): Promise<void> {
  if (!SUPABASE_CONFIGURED || !supabase) return;
  await supabase.from("room_reservations").update({ refunded: true }).eq("id", reservationId);
}

// ---------- Reservas de mesa (dashboard do comerciante) ----------
export async function fetchTableReservationsForBusiness(
  businessId: string,
): Promise<TableReservation[]> {
  if (!SUPABASE_CONFIGURED || !supabase) return [];
  const { data, error } = await supabase
    .from("table_reservations")
    .select("*")
    .eq("business_id", businessId)
    .order("created_at", { ascending: false });
  if (error || !data) return [];
  return data.map(mapTableReservation);
}

// Marca que já repassaste a metade ao negócio (M-Pesa/e-Mola).
export async function markTableReservationRepassado(reservationId: string): Promise<void> {
  if (!SUPABASE_CONFIGURED || !supabase) return;
  await supabase.from("table_reservations").update({ repassado: true }).eq("id", reservationId);
}

// ---------- "As minhas reservas" (ecrã do cliente) ----------
export async function fetchMyRoomReservations(userId: string): Promise<RoomReservation[]> {
  if (!SUPABASE_CONFIGURED || !supabase) return [];
  const { data, error } = await supabase
    .from("room_reservations")
    .select("*, business_rooms(name)")
    .eq("client_user_id", userId)
    .order("created_at", { ascending: false });
  if (error || !data) return [];
  return data.map(mapRoomReservation);
}

export async function fetchMyTableReservations(userId: string): Promise<TableReservation[]> {
  if (!SUPABASE_CONFIGURED || !supabase) return [];
  const { data, error } = await supabase
    .from("table_reservations")
    .select("*")
    .eq("client_user_id", userId)
    .order("created_at", { ascending: false });
  if (error || !data) return [];
  return data.map(mapTableReservation);
}

// ---------- Definições de reserva por negócio ----------
export interface BusinessReservationSettings {
  acceptsRoomReservation: boolean;
  acceptsTableReservation: boolean;
  whatsappReservas: string | null;
  numeroRepasse: string | null;
  mesaPrecoNormal: number;
  mesaPrecoEvento: number;
}

export async function fetchReservationSettings(
  businessId: string,
): Promise<BusinessReservationSettings | null> {
  if (!SUPABASE_CONFIGURED || !supabase) return null;
  const { data, error } = await supabase
    .from("businesses")
    .select(
      "accepts_room_reservation, accepts_table_reservation, whatsapp_reservas, numero_repasse, mesa_preco_normal, mesa_preco_evento",
    )
    .eq("id", businessId)
    .maybeSingle();
  if (error || !data) return null;
  return {
    acceptsRoomReservation: data.accepts_room_reservation,
    acceptsTableReservation: data.accepts_table_reservation,
    whatsappReservas: data.whatsapp_reservas ?? null,
    numeroRepasse: data.numero_repasse ?? null,
    mesaPrecoNormal: data.mesa_preco_normal,
    mesaPrecoEvento: data.mesa_preco_evento,
  };
}

export async function updateReservationSettings(
  businessId: string,
  patch: Partial<BusinessReservationSettings>,
): Promise<void> {
  if (!SUPABASE_CONFIGURED || !supabase) return;
  const dbPatch: Record<string, unknown> = {};
  if (patch.acceptsRoomReservation !== undefined)
    dbPatch.accepts_room_reservation = patch.acceptsRoomReservation;
  if (patch.acceptsTableReservation !== undefined)
    dbPatch.accepts_table_reservation = patch.acceptsTableReservation;
  if (patch.whatsappReservas !== undefined) dbPatch.whatsapp_reservas = patch.whatsappReservas;
  if (patch.numeroRepasse !== undefined) dbPatch.numero_repasse = patch.numeroRepasse;
  if (patch.mesaPrecoNormal !== undefined) dbPatch.mesa_preco_normal = patch.mesaPrecoNormal;
  if (patch.mesaPrecoEvento !== undefined) dbPatch.mesa_preco_evento = patch.mesaPrecoEvento;
  await supabase.from("businesses").update(dbPatch).eq("id", businessId);
}

// ---------- Link do WhatsApp pós-pagamento (só depois de confirmado) ----------
export function buildPostPaymentWhatsAppLink(
  whatsappNumber: string,
  kind: "room" | "table",
  details: string,
): string {
  const digits = whatsappNumber.replace(/\D/g, "");
  const text =
    kind === "room"
      ? `Olá! Acabei de reservar ${details} através do Spotter Local. Gostava de confirmar preferências e receber mais detalhes. Aguardo a vossa resposta!`
      : `Olá! Acabei de reservar uma mesa (${details}) através do Spotter Local. Aguardo a vossa confirmação!`;
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}
