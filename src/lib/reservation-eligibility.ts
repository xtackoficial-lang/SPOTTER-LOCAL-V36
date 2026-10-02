// ============================================================
// Que tipos de negócio podem receber reservas ONLINE (com pagamento)
// Pedido do Abrão (2026-09-30): só hotéis, hotéis + restaurantes,
// restaurantes, lanchonetes e parques/sítios turísticos. Um táxi,
// uma farmácia, um barbeiro... NÃO podem ter reservas de quarto nem
// de mesa, mesmo que alguém ligue o interruptor.
//
// Esta lista existe em 3 sítios que têm de ficar iguais:
//   1) aqui (esconde botões e definições na app)
//   2) supabase/functions/create-zumbopay-payment (recusa o pagamento)
//   3) supabase/migrations/009_reservation_categories.sql (BD)
// Para mudar quem pode reservar, altera os três.
// ============================================================

/** Reservas de QUARTO: só quem tem alojamento. */
export const ROOM_RESERVATION_CATEGORIES = ["hotel", "hotel_restaurant"] as const;

/** Reservas de MESA/espaço: alojamento, comida e parques. */
export const TABLE_RESERVATION_CATEGORIES = [
  "hotel",
  "hotel_restaurant",
  "restaurant",
  "snack_bar",
  "tourism_site",
] as const;

export function canOfferRoomReservations(category?: string | null): boolean {
  return !!category && (ROOM_RESERVATION_CATEGORIES as readonly string[]).includes(category);
}

export function canOfferTableReservations(category?: string | null): boolean {
  return !!category && (TABLE_RESERVATION_CATEGORIES as readonly string[]).includes(category);
}

export function canOfferAnyReservation(category?: string | null): boolean {
  return canOfferRoomReservations(category) || canOfferTableReservations(category);
}
