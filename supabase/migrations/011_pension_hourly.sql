-- ============================================================
-- Spotter Local — 011: Pensão (reserva de quarto por HORA e/ou por DIA)
-- Correr no Supabase → SQL Editor (idempotente).
-- ============================================================

-- Preço por hora (opcional) em cada quarto. O preço por dia/noite continua
-- em price_per_night (0 = este quarto não se vende por dia).
alter table public.business_rooms
  add column if not exists price_per_hour numeric;

-- Cada reserva guarda se foi por noite(s) ou por hora(s).
alter table public.room_reservations
  add column if not exists booking_unit text not null default 'night',
  add column if not exists hours int,
  add column if not exists start_time text;

alter table public.room_reservations drop constraint if exists room_reservations_booking_unit_check;
alter table public.room_reservations
  add constraint room_reservations_booking_unit_check
  check (booking_unit in ('night', 'hour'));

-- A categoria "pension" passa a poder receber reservas de quarto
-- (igual a src/lib/reservation-eligibility.ts e à Edge Function).
create or replace function public.category_allows_room_reservations(cat text)
returns boolean language sql immutable as $$
  select cat in ('hotel', 'hotel_restaurant', 'pension');
$$;
