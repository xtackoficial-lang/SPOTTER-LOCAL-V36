-- ============================================================
-- SPOTTER LOCAL — Script SQL completo (v2.9)
-- Executa no Supabase: SQL Editor → New Query → Cola tudo → Run
--
-- Este script corrige e substitui versões anteriores: as tabelas
-- "payments" e "analytics" foram adicionadas (faltavam), "reviews"
-- foi corrigida para bater com as colunas que o código já usa, e
-- as 3 funções RPC chamadas pelo código (increment_analytic,
-- increment_helpful, update_business_rating) foram criadas —
-- antes não existiam, por isso essas chamadas falhavam sempre.
-- ============================================================

-- TABELA: profiles
-- (Nota: o tipo de conta — pessoal/comercial — é guardado no
-- user_metadata do Supabase Auth via supabase.auth.updateUser(),
-- não nesta tabela. Esta tabela existe para uso futuro/opcional.)
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  profile_type text check (profile_type in ('personal','business')),
  name text,
  email text,
  province text,
  city text,
  country text,
  phone text,
  created_at timestamptz default now()
);
alter table public.profiles enable row level security;
drop policy if exists "Utilizador vê o seu perfil" on public.profiles;
create policy "Utilizador vê o seu perfil" on public.profiles
  for all using (auth.uid() = id);

-- TABELA: businesses
create table if not exists public.businesses (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references auth.users(id) on delete cascade,
  business_name text not null,
  category text,
  -- Província (só Moçambique — ver mozambique-locations.ts). Nível
  -- PRINCIPAL de correspondência com clientes na Home/Busca. "city" e
  -- "neighborhood" continuam a ser só detalhe visual do endereço.
  province text,
  neighborhood text, -- bairro
  city text,
  country text,
  address text,
  phone text,
  description text,
  tags text[],
  website text,
  hours_open text default '08:00',
  hours_close text default '18:00',
  open_days int[],
  structure_id text default 'classica',
  theme_id text default 'classico',
  background_id text,
  block_order text[],
  always_open boolean default false,
  cover_image text,
  gallery text[] default '{}',
  verified boolean default false,
  plan_id text check (plan_id in ('free','starter','pro','premium')) default 'free',
  plan_status text check (plan_status in ('active','trial','overdue','blocked')) default 'active',
  plan_renews_at timestamptz,
  payment_method text,
  last_payment_at timestamptz,
  lat double precision,
  lng double precision,
  rating numeric(3,2) default 0,
  reviews_count int default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
alter table public.businesses enable row level security;
drop policy if exists "Dono gere o seu negócio" on public.businesses;
create policy "Dono gere o seu negócio" on public.businesses
  for all using (auth.uid() = owner_id);
drop policy if exists "Todos vêem negócios activos" on public.businesses;
create policy "Todos vêem negócios activos" on public.businesses
  for select using (plan_status in ('active','trial'));

-- CONSERTO (auditoria de segurança): "for all using (auth.uid() = owner_id)"
-- deixa o dono mudar QUALQUER coluna, incluindo plan_id/verified — ou
-- seja, um comerciante conseguia auto-promover-se a Premium/verificado
-- sem pagar. Este trigger repõe esses campos se quem mexeu não for admin.
create or replace function public.protect_business_admin_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    new.plan_id := old.plan_id;
    new.plan_status := old.plan_status;
    new.verified := old.verified;
    new.plan_renews_at := old.plan_renews_at;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_protect_business_admin_fields on public.businesses;
create trigger trg_protect_business_admin_fields
  before update on public.businesses
  for each row execute function public.protect_business_admin_fields();

-- Se já tinhas esta tabela criada antes desta funcionalidade existir
-- (create table if not exists não adiciona colunas a uma tabela já
-- existente), estas linhas adicionam as colunas em falta sem apagar
-- nada do que já lá está.
alter table public.businesses add column if not exists province text;
alter table public.businesses add column if not exists neighborhood text;
-- Palavras-chave para a Busca (ver auditoria 2026-07-08 no relatório) —
-- array de texto, ex: {"marisco","wifi","vista mar"}.
alter table public.businesses add column if not exists tags text[];
alter table public.profiles add column if not exists province text;
create index if not exists idx_businesses_province on public.businesses (province);

-- TABELA: products
create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  business_id uuid references public.businesses(id) on delete cascade,
  name text not null,
  description text,
  price numeric(10,2) default 0,
  currency text default 'MZN',
  category text,
  image_url text,
  available boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
alter table public.products enable row level security;
drop policy if exists "Dono gere produtos" on public.products;
create policy "Dono gere produtos" on public.products
  for all using (
    auth.uid() = (select owner_id from public.businesses where id = business_id)
  );
drop policy if exists "Todos vêem produtos disponíveis" on public.products;
create policy "Todos vêem produtos disponíveis" on public.products
  for select using (available = true);

-- TABELA: reviews
-- Corrigida para bater com src/lib/reviews-db.ts: o código usa
-- author_id/author_name (não user_id), text (não comment), e
-- precisa de verified/helpful/reported para os botões "útil" e
-- "reportar" e para o selo de comprador verificado.
create table if not exists public.reviews (
  id uuid primary key default gen_random_uuid(),
  business_id uuid references public.businesses(id) on delete cascade,
  author_id uuid references auth.users(id) on delete cascade,
  author_name text not null default 'Visitante',
  rating int check (rating between 1 and 5) not null,
  text text not null,
  verified boolean default false,
  helpful int default 0,
  reported boolean default false,
  created_at timestamptz default now()
);
alter table public.reviews enable row level security;
drop policy if exists "Utilizador gere as suas reviews" on public.reviews;
create policy "Utilizador gere as suas reviews" on public.reviews
  for all using (auth.uid() = author_id);
drop policy if exists "Todos vêem reviews não reportadas" on public.reviews;
create policy "Todos vêem reviews não reportadas" on public.reviews
  for select using (reported = false);

-- CONSERTO (auditoria de segurança): "for all using (auth.uid() = author_id)"
-- deixava o autor marcar a própria review como "verificado" (selo de
-- compra verificada). Este trigger repõe o campo se não for admin.
create or replace function public.protect_review_verified()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then
    new.verified := old.verified;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_protect_review_verified on public.reviews;
create trigger trg_protect_review_verified
  before update on public.reviews
  for each row execute function public.protect_review_verified();

-- TABELA: messages
create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  business_id uuid references public.businesses(id) on delete cascade,
  sender_id uuid references auth.users(id) on delete cascade,
  receiver_id uuid references auth.users(id) on delete cascade,
  text text not null,
  read boolean default false,
  created_at timestamptz default now()
);
alter table public.messages enable row level security;
drop policy if exists "Apenas participantes vêem mensagens" on public.messages;
create policy "Apenas participantes vêem mensagens" on public.messages
  for all using (
    auth.uid() = sender_id or auth.uid() = receiver_id
  );

-- TABELA: payments
-- Nova — faltava por completo. Corresponde ao que src/lib/payments-db.ts
-- já espera: pedidos de pagamento M-Pesa/e-Mola/manual com referência
-- única, prazo de expiração e referência do operador para confirmação.
create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  business_id uuid references public.businesses(id) on delete cascade,
  merchant_ref text not null,
  plan_id text check (plan_id in ('starter','pro','premium')) not null,
  amount numeric(10,2) not null,
  currency text default 'MZN',
  method text check (method in ('mpesa','emola','manual')) not null,
  phone text,
  status text check (status in ('pending','confirmed','failed','expired')) default 'pending',
  operator_ref text,
  confirmed_at timestamptz,
  fail_reason text,
  created_at timestamptz default now(),
  expires_at timestamptz not null
);
alter table public.payments enable row level security;
drop policy if exists "Dono gere os seus pagamentos" on public.payments;
create policy "Dono gere os seus pagamentos" on public.payments
  for all using (
    auth.uid() = (select owner_id from public.businesses where id = business_id)
  );

-- TABELA: analytics
-- Substitui "analytics_events": o código (src/lib/analytics-db.ts) não
-- regista eventos individuais, agrega contadores por dia e por negócio.
create table if not exists public.analytics (
  id uuid primary key default gen_random_uuid(),
  business_id uuid references public.businesses(id) on delete cascade,
  date date not null,
  views int default 0,
  clicks int default 0,
  messages int default 0,
  map_pins int default 0,
  calls int default 0,
  unique (business_id, date)
);
-- Se a tabela já existir de uma versão anterior (sem a coluna "calls"),
-- este comando adiciona-a sem apagar os dados já registados:
alter table public.analytics add column if not exists calls int default 0;
alter table public.analytics enable row level security;
drop policy if exists "Dono vê os seus analytics" on public.analytics;
create policy "Dono vê os seus analytics" on public.analytics
  for select using (
    auth.uid() = (select owner_id from public.businesses where id = business_id)
  );
drop policy if exists "Qualquer um regista evento via função" on public.analytics;
create policy "Qualquer um regista evento via função" on public.analytics
  for insert with check (true);
drop policy if exists "Qualquer um actualiza contagem via função" on public.analytics;
create policy "Qualquer um actualiza contagem via função" on public.analytics
  for update using (true);

-- ============================================================
-- FUNÇÕES RPC — chamadas pelo código mas que não existiam
-- ============================================================

-- increment_analytic: usada em trackEvent() (analytics-db.ts) para
-- somar +1 ao contador certo (views/clicks/messages/mapPin) no dia.
create or replace function public.increment_analytic(
  p_business_id uuid,
  p_date date,
  p_type text
) returns void
language plpgsql
security definer
as $$
begin
  insert into public.analytics (business_id, date, views, clicks, messages, map_pins, calls)
  values (
    p_business_id,
    p_date,
    case when p_type = 'view' then 1 else 0 end,
    case when p_type = 'click' then 1 else 0 end,
    case when p_type = 'message' then 1 else 0 end,
    case when p_type = 'mapPin' then 1 else 0 end,
    case when p_type = 'call' then 1 else 0 end
  )
  on conflict (business_id, date) do update set
    views = public.analytics.views + (case when p_type = 'view' then 1 else 0 end),
    clicks = public.analytics.clicks + (case when p_type = 'click' then 1 else 0 end),
    messages = public.analytics.messages + (case when p_type = 'message' then 1 else 0 end),
    map_pins = public.analytics.map_pins + (case when p_type = 'mapPin' then 1 else 0 end),
    calls = public.analytics.calls + (case when p_type = 'call' then 1 else 0 end);
end;
$$;

-- increment_helpful: usada em markHelpful() (reviews-db.ts) quando
-- alguém marca uma avaliação como "útil".
create or replace function public.increment_helpful(
  p_review_id uuid
) returns void
language plpgsql
security definer
as $$
begin
  update public.reviews
  set helpful = helpful + 1
  where id = p_review_id;
end;
$$;

-- update_business_rating: usada em submitReview() (reviews-db.ts)
-- para recalcular a média e o total de avaliações do negócio depois
-- de uma nova review ser inserida.
create or replace function public.update_business_rating(
  p_business_id uuid
) returns void
language plpgsql
security definer
as $$
begin
  update public.businesses b
  set
    rating = coalesce((
      select round(avg(r.rating)::numeric, 2)
      from public.reviews r
      where r.business_id = p_business_id and r.reported = false
    ), 0),
    reviews_count = (
      select count(*)
      from public.reviews r
      where r.business_id = p_business_id and r.reported = false
    )
  where b.id = p_business_id;
end;
$$;

-- REALTIME
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'messages'
  ) then
    alter publication supabase_realtime add table public.messages;
  end if;
end $$;
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'businesses'
  ) then
    alter publication supabase_realtime add table public.businesses;
  end if;
end $$;

-- ============================================================
-- TRIGGER: criar automaticamente uma linha em public.profiles
-- sempre que um novo utilizador se regista via Supabase Auth.
-- Sem isto, signUp() grava em auth.users (e em user_metadata),
-- mas a tabela public.profiles fica sempre vazia.
-- ============================================================
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, name, profile_type)
  values (
    new.id,
    new.email,
    new.raw_user_meta_data ->> 'name',
    new.raw_user_meta_data ->> 'profileType'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================================
-- TRIGGER: manter public.profiles em sincronia quando o
-- utilizador actualiza profileType/name via supabase.auth.updateUser()
-- (setProfileType() em auth.ts chama updateUser, não escreve em profiles
-- directamente — sem isto, profiles.profile_type fica desactualizado).
-- ============================================================
create or replace function public.handle_user_updated()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.profiles
  set
    name = coalesce(new.raw_user_meta_data ->> 'name', name),
    profile_type = coalesce(new.raw_user_meta_data ->> 'profileType', profile_type)
  where id = new.id;
  return new;
end;
$$;

drop trigger if exists on_auth_user_updated on auth.users;
create trigger on_auth_user_updated
  after update on auth.users
  for each row execute function public.handle_user_updated();

-- ============================================================
-- TABELA: app_theme (Aparência / Temas sazonais — v14)
-- ------------------------------------------------------------
-- Configuração GLOBAL e ÚNICA de aparência da app: tema activo,
-- cores/fundo/imagem/animação por página, texto de boas-vindas, etc.
-- Alterada apenas pelo painel admin (Spotter Local não tem conceito de
-- utilizador "admin" no Supabase Auth — a protecção do ecrã admin é feita
-- na própria app via password local). Por isso a escrita é permitida à
-- chave anónima (igual à leitura), e a segurança do "quem pode escrever"
-- fica inteiramente a cargo do ecrã /admin da app, não do Supabase.
-- Esta tabela tem sempre exactamente UMA linha (id fixo 'default'), que é
-- actualizada (não inserida de novo) sempre que o admin guarda alterações.
-- ============================================================
create table if not exists public.app_theme (
  id text primary key default 'default',
  config jsonb not null default '{}'::jsonb,
  updated_at timestamptz default now()
);
alter table public.app_theme enable row level security;
drop policy if exists "Todos podem ler o tema" on public.app_theme;
create policy "Todos podem ler o tema" on public.app_theme
  for select using (true);
-- CONSERTO (auditoria de segurança): só admin escreve; leitura continua pública.
drop policy if exists "Todos podem actualizar o tema (protegido na app)" on public.app_theme;
create policy "app_theme_admin_write" on public.app_theme
  for all using (public.is_admin()) with check (public.is_admin());

-- Garante que já existe a linha 'default' pronta a ser actualizada.
insert into public.app_theme (id, config)
values ('default', '{}'::jsonb)
on conflict (id) do nothing;

-- REALTIME: activar para o tema, para que mudanças no admin se reflictam
-- instantaneamente em todos os dispositivos com a app aberta.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'app_theme'
  ) then
    alter publication supabase_realtime add table public.app_theme;
  end if;
end $$;

-- ============================================================
-- NOTIFICAÇÕES PUSH REAIS (Firebase Cloud Messaging) — v14
-- ------------------------------------------------------------
-- Três peças:
-- 1. push_tokens          — um token FCM por dispositivo/utilizador
-- 2. scheduled_notifications — o que o admin agendou (dia/hora, segmento,
--    texto livre OU modo "automático personalizado")
-- 3. push_log             — histórico do que foi realmente enviado
--    (substitui o antigo localStorage de campanhas, que era só decorativo)
-- A função send-scheduled-notifications (Edge Function) lê 2, decide o
-- que disparar "agora", envia via FCM usando os tokens de 1, e grava o
-- resultado em 3.
-- ============================================================

-- TABELA: push_tokens
create table if not exists public.push_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  token text not null unique,
  platform text check (platform in ('web','android','ios')) default 'web',
  created_at timestamptz default now(),
  last_seen_at timestamptz default now()
);
alter table public.push_tokens enable row level security;
drop policy if exists "Utilizador gere os seus próprios tokens" on public.push_tokens;
create policy "Utilizador gere os seus próprios tokens" on public.push_tokens
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
-- A Edge Function lê TODOS os tokens (não só os do utilizador autenticado),
-- usando a service_role key — que ignora RLS por definição. Não é preciso
-- policy extra para isso.

-- Adiciona à tabela profiles os campos que faltam para a personalização
-- de notificações funcionar no servidor (nome e cidade escolhidos no
-- onboarding, que antes só viviam em localStorage e nunca chegavam aqui).
alter table public.profiles add column if not exists favorite_category text;

-- TABELA: scheduled_notifications
create table if not exists public.scheduled_notifications (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text not null,
  -- modo 'custom': título/corpo fixos, iguais para todos os destinatários.
  -- modo 'auto_visit': ignora título/corpo e gera "Olá {nome}, gostarias
  -- de visitar {local}?" por destinatário, no momento do envio.
  mode text check (mode in ('custom','auto_visit')) default 'custom',
  target text check (target in ('all','merchants','premium_merchants','inactive_users','personal_users')) default 'all',
  city text, -- filtro opcional por cidade
  -- Agendamento: dias da semana (0=Domingo..6=Sábado) + hora local (HH:MM,
  -- fuso de Moçambique/CAT, UTC+2) + se repete todas as semanas nesses dias
  -- ou é um envio único numa data específica.
  schedule_type text check (schedule_type in ('once','weekly')) default 'once',
  send_at timestamptz, -- usado quando schedule_type = 'once'
  weekdays int[], -- usado quando schedule_type = 'weekly', ex: {1,3,5}
  send_hour int check (send_hour between 0 and 23),
  send_minute int check (send_minute between 0 and 59) default 0,
  active boolean default true,
  last_sent_at timestamptz,
  created_at timestamptz default now()
);
alter table public.scheduled_notifications enable row level security;
-- CONSERTO (auditoria de segurança): "protegida na app" não é RLS. Só admin.
drop policy if exists "Leitura e escrita protegidas na app (admin)" on public.scheduled_notifications;
create policy "scheduled_notifications_admin" on public.scheduled_notifications
  for all using (public.is_admin()) with check (public.is_admin());

-- TABELA: push_log (histórico real de envios, por campanha agendada)
create table if not exists public.push_log (
  id uuid primary key default gen_random_uuid(),
  scheduled_id uuid references public.scheduled_notifications(id) on delete set null,
  title text not null,
  body text not null,
  target text,
  recipients_count int default 0,
  success_count int default 0,
  failure_count int default 0,
  sent_at timestamptz default now()
);
alter table public.push_log enable row level security;
-- CONSERTO (auditoria de segurança): idem — só admin.
drop policy if exists "Leitura protegida na app (admin)" on public.push_log;
create policy "push_log_admin" on public.push_log
  for all using (public.is_admin()) with check (public.is_admin());

-- ============================================================
-- CHAT COM ANEXOS (imagem, câmara, documento, áudio) — v16
-- ------------------------------------------------------------
-- Adiciona à tabela messages o suporte a um anexo opcional por
-- mensagem. attachment_type guarda a categoria (image/document/
-- audio), não o mime exacto — isso fica em attachment_mime.
--
-- ATUALIZADO no bloco v31: attachment_url substitui attachment_data.
-- O ficheiro deixou de ir em base64 dentro da coluna — agora vai para
-- o Supabase Storage (bucket spotter-media) e esta coluna guarda só
-- a URL pública (texto curto). Ver bloco v31 mais abaixo.
-- ============================================================
alter table public.messages add column if not exists attachment_url text;
alter table public.messages add column if not exists attachment_type text
  check (attachment_type in ('image','document','audio'));
alter table public.messages add column if not exists attachment_name text;
alter table public.messages add column if not exists attachment_mime text;
-- Remove a coluna antiga em base64, se existir de uma execução anterior
-- deste script (antes do bloco v31) — os dados antigos em base64 não
-- são migrados automaticamente para o Storage, mas isso não é um
-- problema real: são só mensagens de chat antigas, não dados
-- estruturais do negócio.
alter table public.messages drop column if exists attachment_data;

-- ============================================================
-- TURBINAR / DESTACAR NEGÓCIO ("Boost") — v17
-- ------------------------------------------------------------
-- Pagamento único (60 MZN/dia, preço linear) para o negócio
-- aparecer no topo das listagens (home/search). O comerciante
-- escolhe um pacote — 1, 7 ou 30 dias. Reaproveita a tabela
-- payments já existente (mesmo fluxo M-Pesa/e-Mola/manual), com
-- um plan_id especial 'boost'. A constraint de plan_id precisa de
-- ser alargada para aceitar esse valor extra.
-- ============================================================
alter table public.payments drop constraint if exists payments_plan_id_check;
alter table public.payments add constraint payments_plan_id_check
  check (plan_id in ('starter','pro','premium','boost'));

-- Guarda qual pacote (1/7/30 dias) foi pedido — só relevante quando
-- plan_id = 'boost'; fica null para pagamentos de plano mensal.
alter table public.payments add column if not exists boost_package_id text
  check (boost_package_id in ('1d','7d','30d'));

-- TABELA: business_boosts
-- Um registo por turbinar aprovado. expires_at é a meia-noite (CAT/
-- UTC+2) N dias depois da aprovação, onde N vem do pacote escolhido
-- (duration_days). Vários negócios podem ter um boost activo ao
-- mesmo tempo — ficam todos no topo, com os pacotes mais longos
-- (30 dias > 7 dias > 1 dia) à frente dos mais curtos; dentro do
-- mesmo pacote, quem activou primeiro aparece primeiro.
create table if not exists public.business_boosts (
  id uuid primary key default gen_random_uuid(),
  business_id uuid references public.businesses(id) on delete cascade,
  payment_id uuid references public.payments(id) on delete set null,
  package_id text not null default '1d' check (package_id in ('1d','7d','30d')),
  duration_days integer not null default 1,
  activated_at timestamptz not null default now(),
  expires_at timestamptz not null,
  created_at timestamptz default now()
);
-- Migração para quem já tinha a tabela criada na v16 (sem pacotes):
alter table public.business_boosts add column if not exists package_id text
  not null default '1d' check (package_id in ('1d','7d','30d'));
alter table public.business_boosts add column if not exists duration_days integer
  not null default 1;

alter table public.business_boosts enable row level security;
drop policy if exists "Dono gere os seus boosts" on public.business_boosts;
create policy "Dono gere os seus boosts" on public.business_boosts
  for all using (
    auth.uid() = (select owner_id from public.businesses where id = business_id)
  );
drop policy if exists "Todos vêem boosts activos (para ordenação pública)" on public.business_boosts;
create policy "Todos vêem boosts activos (para ordenação pública)" on public.business_boosts
  for select using (true);

-- REALTIME: para o admin ver pedidos de boost a aparecer ao vivo.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'business_boosts'
  ) then
    alter publication supabase_realtime add table public.business_boosts;
  end if;
end $$;

-- ============================================================
-- MODELO FREEMIUM — Plano "Free" permanente — v17
-- ------------------------------------------------------------
-- Novo nível de plano: gratuito para sempre (não é trial, não
-- expira, não entra no ciclo de cobrança). Comerciante novo entra
-- directamente no Free; o trial de 14 dias passa a ser um benefício
-- opcional do Starter (ver startStarterTrial em subscription-storage.ts),
-- não o ponto de entrada por omissão.
-- ============================================================
alter table public.businesses drop constraint if exists businesses_plan_id_check;
alter table public.businesses add constraint businesses_plan_id_check
  check (plan_id in ('free','starter','pro','premium'));
-- Negócios existentes que ainda estavam em trial (criados antes desta
-- migração) passam para Free — deixam de estar sujeitos ao bloqueio
-- automático do billing-engine por trial expirado.
update public.businesses set plan_id = 'free', plan_status = 'active'
  where plan_status = 'trial';

-- ============================================================
-- FIM DO SCRIPT
-- ============================================================

-- ============================================================
-- MIGRAÇÃO v18 — Negócios digitais (Online)
-- Executa no SQL Editor do Supabase se a tabela já existir
-- ============================================================
alter table public.businesses
  add column if not exists is_digital boolean default false;

-- Índice para filtrar negócios online rapidamente
create index if not exists idx_businesses_is_digital
  on public.businesses(is_digital)
  where is_digital = true;

-- ============================================================
-- MIGRAÇÃO — Dias de funcionamento (open_days)
-- Executa no SQL Editor do Supabase se a tabela já existir
-- ------------------------------------------------------------
-- O painel do comerciante (merchant.tsx) já tinha um selector visual de
-- "Dias de funcionamento" com pré-visualização, mas nada o persistia —
-- a selecção era descartada ao guardar o perfil. Esta coluna guarda os
-- dias da semana em que o negócio está aberto (0=Domingo..6=Sábado,
-- mesma convenção usada em WEEKDAY_LABELS e na Edge Function de
-- notificações). NULL/ausente = aberto todos os dias (compatibilidade
-- com negócios criados antes desta coluna existir).
-- ============================================================
alter table public.businesses
  add column if not exists open_days int[];

-- ============================================================
-- MIGRAÇÃO — Estruturas & Temas de Perfil do comerciante
-- Executa no SQL Editor do Supabase se a tabela já existir
-- ------------------------------------------------------------
-- Cada categoria de negócio pertence a uma "família" (comida/bebida,
-- alojamento, saúde/serviços pessoais, loja/produto físico,
-- outros/serviços — ver FAMILY_BY_CATEGORY em src/lib/profile-styles.ts).
-- Dentro da família, o comerciante escolhe:
--   - structure_id: que blocos aparecem e em que ordem-base
--   - theme_id: cor de destaque do tema (inclui LED/Glow)
--   - background_id: imagem de fundo pronta da família (opcional,
--     escolha separada da cor — ver BACKGROUNDS_BY_FAMILY)
--   - block_order: a ordem REAL dos blocos para este negócio em
--     concreto (o comerciante pode reordenar dentro da estrutura
--     escolhida — ver pedido do Abrão na conversa de 2026-06-28)
-- NULL/ausente em qualquer um destes = usa os valores por omissão
-- ("classica" + "classico", sem imagem de fundo), que reproduzem
-- exactamente o layout fixo que já existia antes desta funcionalidade
-- — nenhum negócio já cadastrado muda de aspecto sem o comerciante
-- escolher.
-- ============================================================
alter table public.businesses
  add column if not exists structure_id text default 'classica',
  add column if not exists theme_id text default 'classico',
  add column if not exists background_id text,
  add column if not exists block_order text[];

-- Histórico de trocas de estrutura/tema, para aplicar o limite mensal
-- incluído em cada plano (ver themeSwapsPerMonth em cada Plan, dentro
-- de src/lib/subscription-storage.ts: Free 1/mês, Starter 2, Pro 3,
-- Premium 4). Cada linha é UMA troca; contamos quantas há no mês
-- corrente para decidir se o comerciante ainda pode trocar.
create table if not exists public.theme_swap_log (
  id uuid primary key default gen_random_uuid(),
  business_id uuid references public.businesses(id) on delete cascade,
  structure_id text not null,
  theme_id text not null,
  created_at timestamptz default now()
);
alter table public.theme_swap_log enable row level security;
drop policy if exists "Dono ve o seu historico de trocas" on public.theme_swap_log;
create policy "Dono ve o seu historico de trocas" on public.theme_swap_log
  for select using (
    auth.uid() = (select owner_id from public.businesses where id = business_id)
  );
drop policy if exists "Dono regista as suas trocas" on public.theme_swap_log;
create policy "Dono regista as suas trocas" on public.theme_swap_log
  for insert with check (
    auth.uid() = (select owner_id from public.businesses where id = business_id)
  );
create index if not exists idx_theme_swap_log_business_date
  on public.theme_swap_log(business_id, created_at desc);

-- ============================================================
-- v20 — Tabelas para admin Supabase
-- Cole este bloco no SQL Editor do Supabase e clique Run
-- ============================================================

-- ── ADMIN AUDIT LOG ──────────────────────────────────────────
create table if not exists public.admin_audit_log (
  id          text primary key,
  action      text not null,
  target      text not null,
  detail      text not null default '',
  created_at  timestamptz not null default now()
);

alter table public.admin_audit_log enable row level security;

-- CONSERTO (auditoria de segurança): a senha do admin no browser não
-- é fronteira nenhuma — o RLS é a fronteira real. Só quem está na
-- tabela public.admins (via is_admin()) lê/escreve aqui.
drop policy if exists "admin_audit_log_all" on public.admin_audit_log;
create policy "admin_audit_log_all" on public.admin_audit_log
  for all using (public.is_admin()) with check (public.is_admin());

-- ── ADMIN SETTINGS (configs, feature flags, etc.) ────────────
create table if not exists public.admin_settings (
  key         text primary key,
  value       jsonb not null default '{}'::jsonb,
  updated_at  timestamptz not null default now()
);

alter table public.admin_settings enable row level security;

-- CONSERTO (auditoria de segurança): idem — só admin.
drop policy if exists "admin_settings_all" on public.admin_settings;
create policy "admin_settings_all" on public.admin_settings
  for all using (public.is_admin()) with check (public.is_admin());

-- ── PAYMENT PROOFS (comprovativos) ───────────────────────────
create table if not exists public.payment_proofs (
  id               text primary key,
  business_id      uuid references public.businesses(id) on delete set null,
  business_name    text not null default '',
  method           text not null check (method in ('mpesa','emola','manual')),
  amount           numeric not null default 0,
  plan             text not null,
  boost_package_id text,
  proof_note       text not null default '',
  status           text not null default 'pending' check (status in ('pending','confirmed','rejected')),
  submitted_at     timestamptz not null default now(),
  reviewed_at      timestamptz
);

alter table public.payment_proofs enable row level security;

-- CONSERTO (auditoria de segurança): using(true)/with check(true) aqui
-- deixava qualquer pessoa ler comprovativos de todos os negócios e,
-- mais grave, aprovar o próprio pagamento sem admin nenhum.
-- Só o dono do negócio insere o seu comprovativo:
drop policy if exists "payment_proofs_insert" on public.payment_proofs;
create policy "payment_proofs_insert" on public.payment_proofs
  for insert with check (
    auth.uid() = (select owner_id from public.businesses where id = business_id)
  );

-- Só o dono (do seu próprio negócio) ou admin lê:
drop policy if exists "payment_proofs_select" on public.payment_proofs;
create policy "payment_proofs_select" on public.payment_proofs
  for select using (
    public.is_admin()
    or auth.uid() = (select owner_id from public.businesses where id = business_id)
  );

-- Só admin aprova/rejeita (muda o status):
drop policy if exists "payment_proofs_update" on public.payment_proofs;
create policy "payment_proofs_update" on public.payment_proofs
  for update using (public.is_admin()) with check (public.is_admin());

-- ── PUSH CAMPAIGNS (histórico de notificações) ───────────────
create table if not exists public.push_campaigns (
  id               text primary key,
  title            text not null,
  body             text not null,
  target           text not null default 'all',
  city             text,
  sent_at          timestamptz not null default now(),
  sent_by          text not null default 'admin',
  estimated_reach  integer not null default 0
);

alter table public.push_campaigns enable row level security;

-- CONSERTO (auditoria de segurança): só admin.
drop policy if exists "push_campaigns_all" on public.push_campaigns;
create policy "push_campaigns_all" on public.push_campaigns
  for all using (public.is_admin()) with check (public.is_admin());

-- ── COLUNAS EXTRA NA TABELA BUSINESSES (se não existirem) ────
-- Adiciona colunas que o admin precisa mas podem não estar no schema antigo

alter table public.businesses
  add column if not exists owner_name   text not null default '',
  add column if not exists email        text,
  add column if not exists plan_status  text not null default 'active'
    check (plan_status in ('active','trial','overdue','blocked')),
  add column if not exists payment_method text
    check (payment_method in ('mpesa','emola','manual') or payment_method is null),
  add column if not exists last_payment_at timestamptz,
  add column if not exists notes        text,
  add column if not exists updated_at   timestamptz not null default now();

-- Índice para pesquisas do admin
create index if not exists idx_businesses_plan_status on public.businesses (plan_status);
create index if not exists idx_businesses_city        on public.businesses (city);
create index if not exists idx_payment_proofs_status  on public.payment_proofs (status);
create index if not exists idx_admin_audit_log_at     on public.admin_audit_log (created_at desc);

-- ── TRIGGER: updated_at automático em businesses ──────────────
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_businesses_updated_at on public.businesses;
create trigger trg_businesses_updated_at
  before update on public.businesses
  for each row execute function public.set_updated_at();

-- ============================================================
-- BLOCO ADICIONADO (2026-07-07) — TABELAS EM FALTA
-- ------------------------------------------------------------
-- "orders" e "coupons" já eram usadas pelo código da app
-- (orders-storage.ts, coupons-storage.ts, business.orders.tsx,
-- business.coupons.tsx, OrderModal.tsx) mas nunca tinham sido
-- adicionadas a este ficheiro. Sem estas tabelas no Supabase real,
-- toda a funcionalidade de Pedidos e Cupões falhava silenciosamente
-- e ficava presa apenas em localStorage (nunca sincronizava entre o
-- dispositivo do cliente e o do comerciante).
-- ============================================================

-- TABELA: orders (pedidos feitos dentro do chat)
create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  business_id uuid references public.businesses(id) on delete cascade,
  business_name text not null,
  client_id text not null, -- userId (uuid em texto) ou "guest-<uuid>"
  items jsonb not null default '[]'::jsonb,
  total numeric(10,2) not null default 0,
  note text,
  status text check (status in ('pending','accepted','rejected','delivered','cancelled'))
    default 'pending',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
alter table public.orders enable row level security;
-- Qualquer pessoa (incluindo clientes convidados/"guest-*", sem sessão)
-- pode criar um pedido — é o próprio fluxo do chat, sem isto o cliente
-- nunca conseguia enviar o pedido.
drop policy if exists "Qualquer um cria um pedido" on public.orders;
create policy "Qualquer um cria um pedido" on public.orders
  for insert with check (true);
-- O dono do negócio vê e actualiza (aceitar/recusar/marcar entregue)
-- os pedidos recebidos.
drop policy if exists "Dono do negocio ve os seus pedidos" on public.orders;
create policy "Dono do negocio ve os seus pedidos" on public.orders
  for select using (
    auth.uid() = (select owner_id from public.businesses where id = business_id)
  );
drop policy if exists "Dono do negocio actualiza os seus pedidos" on public.orders;
create policy "Dono do negocio actualiza os seus pedidos" on public.orders
  for update using (
    auth.uid() = (select owner_id from public.businesses where id = business_id)
  );
-- O cliente autenticado também vê o seu próprio histórico de pedidos
-- (history.tsx). Pedidos feitos como convidado ("guest-*") não têm
-- sessão para restringir por RLS — ficam visíveis apenas pelo dono do
-- negócio, como já garantido acima.
drop policy if exists "Cliente ve os seus proprios pedidos" on public.orders;
create policy "Cliente ve os seus proprios pedidos" on public.orders
  for select using (client_id = auth.uid()::text);
create index if not exists idx_orders_business_id on public.orders (business_id);
create index if not exists idx_orders_client_id    on public.orders (client_id);

-- TABELA: coupons (cupões de desconto por código)
create table if not exists public.coupons (
  id uuid primary key default gen_random_uuid(),
  business_id uuid references public.businesses(id) on delete cascade,
  code text not null,
  description text,
  discount_type text check (discount_type in ('percent','fixed')) not null,
  discount_value numeric(10,2) not null default 0,
  min_order_value numeric(10,2),
  max_uses int,
  used_count int not null default 0,
  expires_at timestamptz,
  active boolean not null default true,
  created_at timestamptz default now()
);
alter table public.coupons enable row level security;
-- O dono do negócio cria/edita/apaga os seus próprios cupões.
drop policy if exists "Dono gere os seus cupoes" on public.coupons;
create policy "Dono gere os seus cupoes" on public.coupons
  for all using (
    auth.uid() = (select owner_id from public.businesses where id = business_id)
  );
-- Qualquer cliente precisa de conseguir LER um cupão activo para
-- validar o código que introduziu no carrinho (fetchCouponByCode) —
-- sem esta policy, a validação de cupão nunca funcionava para quem
-- não é o dono do negócio.
drop policy if exists "Todos podem ler cupoes activos para validar codigo" on public.coupons;
create policy "Todos podem ler cupoes activos para validar codigo" on public.coupons
  for select using (active = true);
create unique index if not exists idx_coupons_business_code
  on public.coupons (business_id, upper(code));

-- RPC: incrementa used_count de forma atómica (evita perder
-- incrementos quando dois clientes usam o mesmo cupão ao mesmo tempo).
create or replace function public.increment_coupon_use(coupon_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.coupons set used_count = used_count + 1 where id = coupon_id;
$$;

-- ============================================================
-- BLOCO ADICIONADO (2026-07-08) — ADMIN REAL, SEM DADOS INVENTADOS
-- ------------------------------------------------------------
-- Descoberto na auditoria: a senha do painel de admin é só uma
-- verificação no telemóvel (não autentica no Supabase). Como a
-- tabela "profiles" só deixa cada pessoa ver o SEU PRÓPRIO perfil
-- (RLS), e "businesses" só mostra negócios activos a quem não é o
-- dono, o admin NUNCA conseguia ver contas reais nem negócios
-- bloqueados — por isso a aba "Contas" tinha 5 pessoas inventadas
-- (Ana Silva, Carlos Melo...) só para não ficar vazia.
--
-- Esta secção cria uma forma seguro de dizeres ao Supabase "esta
-- conta é minha, sou admin" — sem abrir os dados de todos os
-- utilizadores a qualquer pessoa com a chave pública da app (isso
-- seria um problema de privacidade grave).
--
-- PASSO QUE TENS DE FAZER UMA VEZ, depois de correres este SQL:
-- 1. Cria uma conta normal na app (ecrã de login/registo), como
--    farias enquanto pessoa comum.
-- 2. No Supabase → SQL Editor, corre (troca pelo teu email real):
--      insert into public.admins (id)
--      select id from auth.users where email = 'o-teu-email@aqui.com';
-- 3. A partir daí, sempre que abrires o painel de admin JÁ COM ESSA
--    CONTA autenticada no browser, vês contas e negócios reais.
--    Sem isto, o admin continua a mostrar "sem dados" (nunca dados
--    inventados) em vez de contas fictícias.
-- ============================================================

create table if not exists public.admins (
  id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz default now()
);
alter table public.admins enable row level security;
drop policy if exists "admins_self_read" on public.admins;
create policy "admins_self_read" on public.admins
  for select using (auth.uid() = id);

-- Função "de confiança" (security definer) que verifica se quem está
-- autenticado agora é um admin — usada dentro das políticas abaixo
-- para não teres de abrir a tabela "admins" a todos para a poderem ler.
create or replace function public.is_admin()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists(select 1 from public.admins where id = auth.uid());
$$;

-- Perfis: admin passa a ver e a poder suspender qualquer conta.
alter table public.profiles add column if not exists suspended boolean not null default false;
drop policy if exists "Admin ve todos os perfis" on public.profiles;
create policy "Admin ve todos os perfis" on public.profiles
  for select using (public.is_admin());
drop policy if exists "Admin actualiza perfis" on public.profiles;
create policy "Admin actualiza perfis" on public.profiles
  for update using (public.is_admin());

-- Negócios: admin passa a ver e a gerir TODOS, incluindo bloqueados/
-- atrasados (antes só via os que estavam "active" ou "trial").
drop policy if exists "Admin ve todos os negocios" on public.businesses;
create policy "Admin ve todos os negocios" on public.businesses
  for select using (public.is_admin());
drop policy if exists "Admin gere todos os negocios" on public.businesses;
create policy "Admin gere todos os negocios" on public.businesses
  for update using (public.is_admin());
drop policy if exists "Admin apaga negocios" on public.businesses;
create policy "Admin apaga negocios" on public.businesses
  for delete using (public.is_admin());

-- Fim do bloco v20

-- ============================================================
-- BLOCO v23 — Motor de cobranca automatico (Edge Function + cron)
-- ------------------------------------------------------------
-- Antes: runBillingEngine() so corria quando o admin clicava um botao
-- em /admin (codigo no browser, src/lib/billing-engine.ts). Se o admin
-- nao entrasse no painel, comerciantes em atraso nunca eram bloqueados.
-- Agora: a mesma logica corre no servidor (Edge Function
-- run-billing-engine), agendada via pg_cron 1x/dia - nao depende de
-- ninguem abrir o admin. O botao manual continua a existir em /admin,
-- mas passa a ser so um "correr agora" opcional.
--
-- Ver: supabase/functions/run-billing-engine/index.ts
-- ============================================================

-- Log de execucoes do motor de cobranca - substitui as notificacoes
-- que antes so existiam em localStorage do browser do admin.
create table if not exists public.billing_log (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid references public.businesses(id) on delete cascade,
  business_name text not null,
  event text not null, -- trial_ending | trial_expired | payment_due | payment_overdue | auto_blocked
  message text not null,
  days_until_action int,
  created_at timestamptz default now()
);
alter table public.billing_log enable row level security;
drop policy if exists "Admin ve o log de cobranca" on public.billing_log;
create policy "Admin ve o log de cobranca" on public.billing_log
  for select using (public.is_admin());
-- Nota: nao ha policy de insert/update para utilizadores normais -
-- so a Edge Function escreve aqui, usando a service_role key, que
-- ignora RLS por natureza (nao precisa de policy propria).

create index if not exists billing_log_merchant_idx on public.billing_log(merchant_id);
create index if not exists billing_log_created_idx on public.billing_log(created_at desc);

-- Activa a extensao de agendamento (cron), se ainda nao estiver activa.
-- (Se ja activaste para o send-scheduled-notifications, isto e um no-op.)
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Corre 1x por dia as 06:00 UTC (~08:00 em Maputo, UTC+2) - horario
-- em que ja ha utilizadores acordados mas ainda e cedo para incomodar.
-- Ajusta a hora no '0 6 * * *' se preferires outro horario.
-- CONSERTO (auditoria de segurança): antes mandava a service_role key
-- no header. Depois da função passar a exigir FUNCTION_SECRET (ver
-- supabase/functions/run-billing-engine/index.ts), a service_role
-- key deixa de ser aceite aqui — troca pelo mesmo valor que puseste
-- em Edge Functions → Secrets → FUNCTION_SECRET.
select cron.schedule(
  'motor-de-cobranca-diario',
  '0 6 * * *',
  $$
  select net.http_post(
    url := 'https://<o-teu-project-ref>.supabase.co/functions/v1/run-billing-engine',
    headers := '{"Authorization": "Bearer <o-teu-FUNCTION_SECRET>"}'::jsonb
  );
  $$
);

-- Substitui <o-teu-project-ref> pela referência do teu projecto e
-- <o-teu-FUNCTION_SECRET> pelo mesmo segredo configurado em
-- Edge Functions → Secrets → FUNCTION_SECRET.
--
-- IMPORTANTE: se já tens um cron.schedule activo para a função
-- send-scheduled-notifications (configurado à parte, não está neste
-- ficheiro), confirma com "select * from cron.job;" e actualiza o
-- header dele da mesma forma — troca "Bearer <service-role-key>"
-- por "Bearer <FUNCTION_SECRET>". Sem isso, o cron dessa função
-- também vai começar a levar 401.
--
-- Para confirmar que o cron esta agendado:
--   select * from cron.job;
-- Para ver o historico de execucoes:
--   select * from cron.job_run_details order by start_time desc limit 10;
-- Para correr manualmente pelo SQL Editor (sem esperar pelo cron):
--   select net.http_post(
--     url := 'https://<o-teu-project-ref>.supabase.co/functions/v1/run-billing-engine',
--     headers := '{"Authorization": "Bearer <o-teu-FUNCTION_SECRET>"}'::jsonb
--   );

-- Fim do bloco v23

-- ============================================================
-- BLOCO v30 - Colunas em falta (detectadas por auditoria de codigo)
-- ------------------------------------------------------------
-- O codigo (shop-data.ts, admin-storage.ts, auth.ts, run-billing-engine)
-- usa varias colunas que nao estavam na definicao original das
-- tabelas nos blocos anteriores. Sem este bloco, as seguintes acoes
-- falhavam silenciosamente (o Supabase rejeita a coluna inexistente):
--   - Editar email ou notas de um comerciante no /admin
--   - O motor de cobranca automatico gravar a nota de auto-bloqueio
--   - Suspender/reactivar uma conta de cliente no /admin
--   - Gravar a categoria favorita escolhida no onboarding pessoal
--   - Guardar o nome do proprietario do negocio (campo separado do
--     nome do proprio negocio)
-- ============================================================

alter table public.businesses add column if not exists owner_name text;
alter table public.businesses add column if not exists email text;
alter table public.businesses add column if not exists notes text;

alter table public.profiles add column if not exists suspended boolean default false;
alter table public.profiles add column if not exists favorite_category text;

-- Fim do bloco v30

-- ============================================================
-- BLOCO v31 - Supabase Storage para fotos/anexos (em vez de base64
-- directo nas tabelas)
-- ------------------------------------------------------------
-- Antes: fotos de capa, galeria e anexos de chat eram convertidos
-- para base64 e gravados como TEXTO nas colunas das tabelas
-- (businesses.cover_image, businesses.gallery, messages.attachment_*).
-- Isto enche os 500MB gratis do Postgres do Supabase com poucas
-- dezenas de comerciantes activos, muito antes de qualquer limite
-- realista de utilizadores.
--
-- Agora: as imagens vao para um bucket de Storage dedicado (1GB
-- gratis, SEPARADO do limite de 500MB da base de dados), comprimidas
-- no browser antes do upload (ver src/lib/storage-upload.ts). As
-- colunas passam a guardar so a URL publica (texto curto), nao a
-- imagem inteira.
--
-- IMPORTANTE: correr este bloco cria o bucket automaticamente. Nao
-- e preciso nenhum passo manual no dashboard do Supabase.
-- ============================================================

insert into storage.buckets (id, name, public)
values ('spotter-media', 'spotter-media', true)
on conflict (id) do nothing;

-- Qualquer pessoa pode VER ficheiros (fotos de negocios sao publicas
-- por natureza — e o mesmo nivel de acesso que "Todos veem negocios
-- activos" ja aplicado a tabela businesses).
drop policy if exists "Qualquer um ve ficheiros do bucket spotter-media" on storage.objects;
create policy "Qualquer um ve ficheiros do bucket spotter-media"
  on storage.objects for select
  using (bucket_id = 'spotter-media');

-- Só utilizadores autenticados podem enviar ficheiros, e apenas
-- dentro da sua própria pasta (path começa por <user_id>/), para que
-- um comerciante não consiga escrever na pasta de outro.
drop policy if exists "Utilizador autenticado envia para a sua pasta" on storage.objects;
create policy "Utilizador autenticado envia para a sua pasta"
  on storage.objects for insert
  with check (
    bucket_id = 'spotter-media'
    and auth.role() = 'authenticated'
    and (storage.foldername(name))[2] = auth.uid()::text
  );

drop policy if exists "Utilizador remove os seus proprios ficheiros" on storage.objects;
create policy "Utilizador remove os seus proprios ficheiros"
  on storage.objects for delete
  using (
    bucket_id = 'spotter-media'
    and auth.role() = 'authenticated'
    and (storage.foldername(name))[2] = auth.uid()::text
  );

-- Nota: as colunas de anexo da tabela messages (attachment_url,
-- attachment_type, attachment_name, attachment_mime) já são criadas
-- no bloco "CHAT COM ANEXOS — v16" mais acima, actualizado para usar
-- attachment_url (Storage) em vez de attachment_data (base64).

-- Fim do bloco v31

-- ============================================================
-- CONSERTO (auditoria de segurança) — bucket privado para anexos
-- de chat
-- ------------------------------------------------------------
-- O bloco v31 acima pôs os anexos de chat no MESMO bucket público
-- usado para fotos de capa/galeria (spotter-media). Isso significa
-- que documentos/fotos trocados numa conversa privada entre cliente
-- e comerciante ficavam acessíveis a qualquer pessoa com a URL, sem
-- login. Este bloco cria um bucket SEPARADO e PRIVADO só para
-- anexos de chat — src/lib/storage-upload.ts já foi actualizado
-- para enviar para aqui (kind "chat") e devolver o caminho em vez
-- da URL pública; src/components/MessageAttachment.tsx pede uma
-- URL assinada (createSignedUrl) antes de mostrar o anexo.
-- ============================================================

insert into storage.buckets (id, name, public)
values ('spotter-chat', 'spotter-chat', false)
on conflict (id) do nothing;

-- Só os dois participantes da conversa (quem enviou e quem recebeu)
-- conseguem LER um anexo — confere contra a tabela messages.
drop policy if exists "Participantes veem anexos do chat" on storage.objects;
create policy "Participantes veem anexos do chat"
  on storage.objects for select
  using (
    bucket_id = 'spotter-chat'
    and exists (
      select 1 from public.messages m
      where m.attachment_url like '%' || storage.objects.name
        and (auth.uid() = m.sender_id or auth.uid() = m.receiver_id)
    )
  );

-- Só um utilizador autenticado pode enviar, e só para a sua própria
-- pasta (caminho "chat/<user_id>/ficheiro.jpg").
drop policy if exists "Utilizador autenticado envia anexo de chat" on storage.objects;
create policy "Utilizador autenticado envia anexo de chat"
  on storage.objects for insert
  with check (
    bucket_id = 'spotter-chat'
    and auth.role() = 'authenticated'
    and (storage.foldername(name))[2] = auth.uid()::text
  );

-- Fim do conserto de bucket privado

-- ============================================================
-- BLOCO v32 — Auditoria de segurança (app v25.0.0)
-- ------------------------------------------------------------
-- Ronda de correções contra os 10 furos mais comuns em apps feitas
-- com IA. Resumo do que mudou (ver PDF "Auditoria de Segurança —
-- Explicação das Correções" para o detalhe de cada uma):
--
--  - RLS: admin_audit_log, admin_settings, push_campaigns,
--    scheduled_notifications, push_log, app_theme (escrita) — agora
--    exigem public.is_admin() em vez de using(true).
--  - payment_proofs: insert/select/update separados; só o dono
--    insere/lê o seu, só admin aprova.
--  - businesses e reviews: triggers novos impedem o dono/autor de
--    alterar plan_id/plan_status/verified sozinho.
--  - Bucket spotter-chat (privado) criado para anexos de chat, no
--    lugar do bucket público spotter-media.
--  - cron.schedule da run-billing-engine actualizado para usar
--    FUNCTION_SECRET em vez da service_role key.
--
-- Código correspondente (fora deste ficheiro): .gitignore criado;
-- src/lib/storage-upload.ts e src/components/MessageAttachment.tsx
-- actualizados para o bucket privado; as duas Edge Functions
-- (send-scheduled-notifications, run-billing-engine) passaram a
-- exigir FUNCTION_SECRET ou sessão de admin, e a não devolver
-- detalhe de erro ao chamador.
--
-- Fim do bloco v32
