-- ============================================================
-- 004_reservations.sql
-- Reservas de quarto (hotel) e mesa (restaurante)
-- ============================================================

-- ---------- Novos campos no perfil do negócio ----------
alter table public.businesses
  add column if not exists accepts_room_reservation boolean not null default false,
  add column if not exists accepts_table_reservation boolean not null default false,
  add column if not exists whatsapp_reservas text,           -- número dedicado, só usado após pagamento
  add column if not exists numero_repasse text,               -- M-Pesa/e-Mola para onde enviar a parte do comerciante
  add column if not exists mesa_preco_normal numeric not null default 200,  -- MT, editável por negócio
  add column if not exists mesa_preco_evento numeric not null default 500; -- MT, editável por negócio

-- ---------- Quartos ----------
create table if not exists public.business_rooms (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  name text not null,                     -- ex: "Quarto Duplo"
  capacity int not null,                  -- nº de pessoas
  price_per_night numeric not null,       -- MT
  photo_url text,                         -- Supabase Storage, uma só foto
  active boolean not null default true,   -- comerciante liga/desliga o quarto (existe/não existe)
  occupied_until date,                    -- null = disponível; data = ocupado até essa data (reativa sozinho)
  created_at timestamptz default now()
);

create index if not exists idx_business_rooms_business on public.business_rooms(business_id);

-- ---------- Reservas de quarto ----------
create table if not exists public.room_reservations (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  room_id uuid not null references public.business_rooms(id) on delete cascade,
  client_user_id uuid not null references auth.users(id) on delete cascade,  -- para chat/push
  client_name text not null,
  client_phone text not null,
  client_email text,
  check_in date not null,
  check_out date not null,
  guests int not null,
  special_request text,
  nights int not null,                    -- calculado: check_out - check_in
  total_price numeric not null,           -- price_per_night * nights
  commission_amount numeric not null,     -- 10% do total_price, cobrado via ZumboPay
  payment_id uuid references public.payments(id),
  status text not null default 'pending_payment'
    check (status in ('pending_payment', 'pending_approval', 'confirmed', 'rejected', 'cancelled')),
  rejection_reason text,
  refunded boolean not null default false,   -- true quando o reembolso manual foi feito
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_room_reservations_business on public.room_reservations(business_id);
create index if not exists idx_room_reservations_room on public.room_reservations(room_id);
create index if not exists idx_room_reservations_status on public.room_reservations(status);

-- ---------- Reservas de mesa ----------
create table if not exists public.table_reservations (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  client_user_id uuid not null references auth.users(id) on delete cascade,  -- para chat/push
  client_name text not null,
  client_phone text not null,
  client_email text,
  reservation_date date not null,
  time_slot text not null,                -- ex: "20h00 - 21h00"
  guests int not null,
  special_request text,
  tipo text not null default 'normal' check (tipo in ('normal', 'evento')),
  price numeric not null,                 -- 200 ou 500 MT, copiado do negócio no momento da reserva
  commission_amount numeric not null,     -- metade do price
  payout_amount numeric not null,         -- outra metade, a repassar ao negócio
  payment_id uuid references public.payments(id),
  status text not null default 'pending_payment'
    check (status in ('pending_payment', 'confirmed', 'cancelled')),
  repassado boolean not null default false,  -- true quando já enviaste a metade ao negócio
  created_at timestamptz default now()
);

create index if not exists idx_table_reservations_business on public.table_reservations(business_id);
create index if not exists idx_table_reservations_status on public.table_reservations(status);

-- ---------- RLS ----------
alter table public.business_rooms enable row level security;
alter table public.room_reservations enable row level security;
alter table public.table_reservations enable row level security;

-- Leitura pública de quartos ativos (para o cliente ver ao reservar)
create policy "public read active rooms" on public.business_rooms
  for select using (active = true);

-- Comerciante gere os próprios quartos
create policy "owner manage own rooms" on public.business_rooms
  for all using (
    business_id in (select id from public.businesses where owner_id = auth.uid())
  ) with check (
    business_id in (select id from public.businesses where owner_id = auth.uid())
  );

-- Reservas: o dono do negócio gere as suas; o cliente só lê as próprias.
-- INSERT nunca acontece por aqui (sempre via Edge Function com service
-- role, que ignora RLS) — por isso não há política de INSERT para o
-- cliente, de propósito.
create policy "owner manage own room reservations" on public.room_reservations
  for all using (
    business_id in (select id from public.businesses where owner_id = auth.uid())
  ) with check (
    business_id in (select id from public.businesses where owner_id = auth.uid())
  );

create policy "client reads own room reservations" on public.room_reservations
  for select using (client_user_id = auth.uid());

create policy "owner manage own table reservations" on public.table_reservations
  for all using (
    business_id in (select id from public.businesses where owner_id = auth.uid())
  ) with check (
    business_id in (select id from public.businesses where owner_id = auth.uid())
  );

create policy "client reads own table reservations" on public.table_reservations
  for select using (client_user_id = auth.uid());

-- Realtime (para o dashboard e os ecrãs do cliente actualizarem sozinhos)
alter publication supabase_realtime add table public.room_reservations;
alter publication supabase_realtime add table public.table_reservations;
alter publication supabase_realtime add table public.business_rooms;
