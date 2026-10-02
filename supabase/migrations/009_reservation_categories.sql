-- ============================================================
-- Spotter Local — 009: reservas online só para categorias permitidas
-- Pedido do Abrão (2026-09-30). Correr no Supabase → SQL Editor
-- (idempotente: pode correr mais de uma vez).
--
-- Quarto : hotel, hotel_restaurant
-- Mesa   : hotel, hotel_restaurant, restaurant, snack_bar, tourism_site
-- Tem de ficar igual a src/lib/reservation-eligibility.ts e à
-- Edge Function create-zumbopay-payment.
-- ============================================================

create or replace function public.category_allows_room_reservations(cat text)
returns boolean language sql immutable as $$
  select cat in ('hotel', 'hotel_restaurant');
$$;

create or replace function public.category_allows_table_reservations(cat text)
returns boolean language sql immutable as $$
  select cat in ('hotel', 'hotel_restaurant', 'restaurant', 'snack_bar', 'tourism_site');
$$;

-- 1) Limpa negócios que já tinham o interruptor ligado sem poderem.
update public.businesses
   set accepts_room_reservation = false
 where accepts_room_reservation
   and not public.category_allows_room_reservations(category);

update public.businesses
   set accepts_table_reservation = false
 where accepts_table_reservation
   and not public.category_allows_table_reservations(category);

-- 2) Trigger: mesmo que a app (ou alguém com a chave anon) tente ligar o
--    interruptor, a BD força false para categorias não permitidas.
create or replace function public.enforce_reservation_categories()
returns trigger language plpgsql as $$
begin
  if not public.category_allows_room_reservations(new.category) then
    new.accepts_room_reservation := false;
  end if;
  if not public.category_allows_table_reservations(new.category) then
    new.accepts_table_reservation := false;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_enforce_reservation_categories on public.businesses;
create trigger trg_enforce_reservation_categories
  before insert or update of category, accepts_room_reservation, accepts_table_reservation
  on public.businesses
  for each row execute function public.enforce_reservation_categories();

-- 3) Só negócios que podem receber reservas de quarto criam quartos.
create or replace function public.enforce_rooms_category()
returns trigger language plpgsql as $$
declare cat text;
begin
  select category into cat from public.businesses where id = new.business_id;
  if not public.category_allows_room_reservations(cat) then
    raise exception 'Este tipo de negócio não pode ter quartos para reserva';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_enforce_rooms_category on public.business_rooms;
create trigger trg_enforce_rooms_category
  before insert on public.business_rooms
  for each row execute function public.enforce_rooms_category();
