-- ============================================================
-- SPOTTER LOCAL v37 — PASSO 1 DE 2: CORRER NO SUPABASE (SQL Editor)
-- ============================================================
-- Cola TUDO isto no Supabase → SQL Editor → New query → Run.
-- É seguro correr mais de uma vez (idempotente).
--
-- Junta as migrações 008 + 009 + 010 por ordem:
--   008  pagamentos: aceitar 'zumbopay', planos 'room'/'table', pacotes de
--        publicação/evento (sem isto pagar publicações e eventos falha)
--   009  reservas online só para hotel, hotel+restaurante, restaurante,
--        lanchonete e parque (táxi e outros ficam bloqueados na BD)
--   010  quartos: pagar 100% ou sinal de 20% + prazo de resposta do hotel
--
-- PRÉ-REQUISITO: já teres corrido o SUPABASE_SETUP.sql e as migrações
-- 002 a 007 (se não, corre primeiro o VERIFICAR_BD.sql e vê o que falta).
-- ============================================================

-- >>>>>>>>>> 008_fix_payments_constraints.sql <<<<<<<<<<
-- ============================================================
-- Spotter Local — 008: corrige constraints da tabela payments
-- Correr no Supabase → SQL Editor (seguro repetir: é idempotente).
--
-- 1) method: aceitar 'zumbopay' (a Edge Function grava method='zumbopay')
-- 2) plan_id: aceitar 'room' e 'table' (reservas de quarto/mesa pagas
--    via ZumboPay). Sem isto, o INSERT dessas reservas falhava com
--    "violates check constraint payments_plan_id_check".
-- 3) colunas usadas pela integração (caso a 002/003 não tenha corrido)
-- ============================================================

alter table public.payments drop constraint if exists payments_method_check;
alter table public.payments
  add constraint payments_method_check
  check (method in ('mpesa', 'emola', 'manual', 'zumbopay'));

alter table public.payments drop constraint if exists payments_plan_id_check;
alter table public.payments
  add constraint payments_plan_id_check
  check (plan_id in ('free','starter','pro','premium','boost','post','event','room','table'));

alter table public.payments add column if not exists zumbopay_reference text;
alter table public.payments add column if not exists zumbopay_payment_id text;
alter table public.payments add column if not exists payment_url text;
alter table public.payments add column if not exists content_metadata jsonb;
alter table public.payments add column if not exists boost_package_id text;

create index if not exists idx_payments_zumbopay_payment_id
  on public.payments(zumbopay_payment_id);

-- 4) boost_package_id: a Edge Function usa esta coluna também para o pacote
--    de PUBLICAÇÃO ('24h','3d','7d') e para o nível de EVENTO ('standard',
--    'featured'). A constraint original só aceitava '1d','7d','30d' — por isso
--    pagar uma publicação de 24h/3d ou qualquer evento falhava com
--    "Falha ao registar o pagamento" (descoberto nos testes de 2026-10-01).
alter table public.payments drop constraint if exists payments_boost_package_id_check;
alter table public.payments
  add constraint payments_boost_package_id_check
  check (boost_package_id is null or boost_package_id in ('1d','7d','30d','24h','3d','standard','featured'));

-- >>>>>>>>>> 009_reservation_categories.sql <<<<<<<<<<
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

-- >>>>>>>>>> 010_room_payment_options.sql <<<<<<<<<<
-- ============================================================
-- Spotter Local — 010: reservas de quarto com 2 opções de pagamento
-- Pedido do Abrão (2026-09-30): o cliente escolhe pagar 100% do quarto
-- OU um sinal de 20% para garantir a reserva (a opção de 10% acabou).
-- Depois de pago, o hotel tem um prazo para responder.
-- Correr no Supabase → SQL Editor, depois da 009 (idempotente).
-- ============================================================

alter table public.room_reservations
  add column if not exists payment_option text not null default 'deposit',
  add column if not exists amount_paid numeric,
  add column if not exists balance_due numeric,
  add column if not exists response_deadline timestamptz;

alter table public.room_reservations drop constraint if exists room_reservations_payment_option_check;
alter table public.room_reservations
  add constraint room_reservations_payment_option_check
  check (payment_option in ('full', 'deposit'));

-- Reservas antigas (fluxo dos 10%): o que o cliente pagou foi a "comissão".
update public.room_reservations
   set amount_paid = commission_amount,
       balance_due = greatest(total_price - commission_amount, 0)
 where amount_paid is null;

create index if not exists idx_room_reservations_deadline
  on public.room_reservations(response_deadline)
  where status = 'pending_approval';


-- Confirmação rápida: devem aparecer 3 linhas com "OK".
select 'constraint method (zumbopay)' as verificacao,
       case when pg_get_constraintdef(oid) like '%zumbopay%' then 'OK' else 'FALTA' end as estado
  from pg_constraint where conname = 'payments_method_check' and conrelid = 'public.payments'::regclass
union all
select 'trigger categorias de reserva',
       case when exists(select 1 from pg_trigger where tgname='trg_enforce_reservation_categories') then 'OK' else 'FALTA' end
union all
select 'coluna payment_option (quartos)',
       case when exists(select 1 from information_schema.columns where table_name='room_reservations' and column_name='payment_option') then 'OK' else 'FALTA' end;
