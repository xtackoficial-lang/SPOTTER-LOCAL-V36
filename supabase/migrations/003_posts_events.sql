-- ============================================================
-- Spotter Local — Publicações pagas (feed) + Eventos
-- Ambos exigem conta comercial (business_id), tal como Turbinar.
-- Reaproveita o mesmo motor de pagamento ZumboPay já em uso.
-- ============================================================

-- 1) A "payments" precisa de guardar o conteúdo em rascunho (foto/
--    cartaz/legenda) ANTES do pagamento acontecer, para o webhook
--    conseguir criar a publicação/evento no momento da confirmação
--    sem depender do browser do comerciante estar aberto.
alter table public.payments add column if not exists content_metadata jsonb;

-- 2) Alargar plan_id para aceitar os dois novos tipos.
alter table public.payments drop constraint if exists payments_plan_id_check;
alter table public.payments add constraint payments_plan_id_check
  check (plan_id in ('free','starter','pro','premium','boost','post','event'));

-- ============================================================
-- TABELA: business_posts (Ideia 1 — publicação paga no feed, só fotos)
-- ============================================================
create table if not exists public.business_posts (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  photo_url text not null,
  caption text,
  city text, -- cidade onde a publicação deve aparecer (pode ser diferente da cidade do negócio)
  package_id text not null check (package_id in ('24h', '3d', '7d')),
  payment_id uuid references public.payments(id) on delete set null,
  status text not null default 'pending' check (status in ('pending', 'active', 'expired')),
  published_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.business_posts enable row level security;

drop policy if exists "Dono gere as suas publicacoes" on public.business_posts;
create policy "Dono gere as suas publicacoes" on public.business_posts
  for all using (
    auth.uid() = (select owner_id from public.businesses where id = business_id)
  ) with check (
    auth.uid() = (select owner_id from public.businesses where id = business_id)
  );

-- O feed de descoberta (Home) precisa de ver publicações activas de
-- qualquer negócio — mesmo nível de acesso público que já existe
-- para "businesses" (plan_status active/trial).
drop policy if exists "Todos veem publicacoes activas" on public.business_posts;
create policy "Todos veem publicacoes activas" on public.business_posts
  for select using (status = 'active');

drop policy if exists "Admin gere publicacoes" on public.business_posts;
create policy "Admin gere publicacoes" on public.business_posts
  for all using (public.is_admin()) with check (public.is_admin());

create index if not exists idx_business_posts_business on public.business_posts(business_id);
create index if not exists idx_business_posts_status_expires on public.business_posts(status, expires_at);
create index if not exists idx_business_posts_status_city on public.business_posts(status, city);

-- ============================================================
-- TABELA: events (Ideia 2 — cartazes/bilhetes, exige conta comercial)
-- ============================================================
create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  poster_url text not null,
  title text not null,
  ticket_phone text,
  ticket_link text,
  event_date date,
  city text,
  tier text not null default 'standard' check (tier in ('standard', 'featured')),
  payment_id uuid references public.payments(id) on delete set null,
  status text not null default 'pending' check (status in ('pending', 'active', 'expired')),
  created_at timestamptz not null default now()
);

alter table public.events enable row level security;

drop policy if exists "Dono gere os seus eventos" on public.events;
create policy "Dono gere os seus eventos" on public.events
  for all using (
    auth.uid() = (select owner_id from public.businesses where id = business_id)
  ) with check (
    auth.uid() = (select owner_id from public.businesses where id = business_id)
  );

drop policy if exists "Todos veem eventos activos" on public.events;
create policy "Todos veem eventos activos" on public.events
  for select using (status = 'active');

drop policy if exists "Admin gere eventos" on public.events;
create policy "Admin gere eventos" on public.events
  for all using (public.is_admin()) with check (public.is_admin());

create index if not exists idx_events_business on public.events(business_id);
-- "featured" primeiro, depois mais recentes — ordenação directa da aba Eventos.
create index if not exists idx_events_status_tier_date on public.events(status, tier, event_date);

-- ============================================================
-- REALTIME — para o comerciante ver a publicação/evento activar-se
-- sozinho assim que o pagamento é confirmado (mesmo padrão já usado
-- em "payments" para assinaturas e Turbinar).
-- ============================================================
alter publication supabase_realtime add table public.business_posts;
alter publication supabase_realtime add table public.events;
