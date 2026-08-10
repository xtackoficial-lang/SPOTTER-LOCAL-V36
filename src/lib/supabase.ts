// ============================================================
// XTACK SPOTTER — Supabase Client
// Substitui os valores abaixo pelas tuas credenciais do Supabase
// Dashboard: https://supabase.com/dashboard
// ============================================================
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL ?? "";
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY ?? "";

// Detecta se Supabase está configurado
export const SUPABASE_CONFIGURED =
  SUPABASE_URL.startsWith("https://") &&
  SUPABASE_ANON_KEY.length > 20 &&
  !SUPABASE_URL.includes("xxxxxxxxxxxx");

export const supabase = SUPABASE_CONFIGURED
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        // Persiste a sessão em localStorage explicitamente — importante no
        // APK (WebView) onde o storage por vezes não herda os defaults da
        // mesma forma que num browser desktop "normal".
        persistSession: true,
        storage: typeof window !== "undefined" ? window.localStorage : undefined,
        // Renova o token automaticamente em segundo plano antes de expirar,
        // para que getSession() continue válido sem o utilizador notar.
        autoRefreshToken: true,
        // Mantém a sessão entre fechos/reaberturas da aba/app (essencial
        // para o problema de "pede login outra vez ao reabrir a app").
        detectSessionInUrl: true,
      },
    })
  : null;

// ============================================================
// SCHEMA SQL — Executa no Supabase SQL Editor
// ============================================================
/*
-- TABELA: profiles (utilizadores)
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  profile_type text check (profile_type in ('personal','business')),
  name text,
  email text,
  city text,
  country text,
  phone text,
  created_at timestamptz default now()
);
alter table public.profiles enable row level security;
create policy "Utilizador vê o seu perfil" on public.profiles
  for all using (auth.uid() = id);

-- TABELA: businesses (negócios/comerciantes)
create table if not exists public.businesses (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references auth.users(id) on delete cascade,
  business_name text not null,
  category text,
  city text,
  country text,
  address text,
  phone text,
  description text,
  website text,
  hours_open text default '08:00',
  hours_close text default '18:00',
  always_open boolean default false,
  cover_image text,
  gallery text[] default '{}',
  verified boolean default false,
  plan_id text check (plan_id in ('starter','pro','premium')) default 'starter',
  plan_status text check (plan_status in ('active','trial','overdue','blocked')) default 'trial',
  plan_renews_at timestamptz,
  payment_method text,
  last_payment_at timestamptz,
  lat double precision,
  lng double precision,
  is_digital boolean default false,
  rating numeric(3,2) default 0,
  reviews_count int default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
alter table public.businesses enable row level security;
create policy "Dono gere o seu negócio" on public.businesses
  for all using (auth.uid() = owner_id);
create policy "Todos vêem negócios activos" on public.businesses
  for select using (plan_status in ('active','trial'));

-- TABELA: products (produtos dos comerciantes)
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
create policy "Dono gere produtos" on public.products
  for all using (
    auth.uid() = (select owner_id from public.businesses where id = business_id)
  );
create policy "Todos vêem produtos disponíveis" on public.products
  for select using (available = true);

-- TABELA: messages (chats entre clientes e comerciantes)
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
create policy "Apenas participantes vêem mensagens" on public.messages
  for all using (
    auth.uid() = sender_id or auth.uid() = receiver_id
  );

-- TABELA: subscriptions (histórico de pagamentos)
create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  business_id uuid references public.businesses(id) on delete cascade,
  plan_id text not null,
  amount numeric(10,2),
  currency text default 'MZN',
  payment_method text,
  payment_ref text,
  status text check (status in ('pending','confirmed','failed')) default 'pending',
  paid_at timestamptz,
  period_start timestamptz,
  period_end timestamptz,
  created_at timestamptz default now()
);
alter table public.subscriptions enable row level security;
create policy "Dono vê as suas subscrições" on public.subscriptions
  for all using (
    auth.uid() = (select owner_id from public.businesses where id = business_id)
  );

-- REALTIME: activar para mensagens
alter publication supabase_realtime add table public.messages;
alter publication supabase_realtime add table public.businesses;

-- TABELA: app_theme (Aparência / Temas sazonais)
-- Ver detalhes completos em SUPABASE_SETUP.sql
create table if not exists public.app_theme (
  id text primary key default 'default',
  config jsonb not null default '{}'::jsonb,
  updated_at timestamptz default now()
);
alter table public.app_theme enable row level security;
create policy "Todos podem ler o tema" on public.app_theme
  for select using (true);
create policy "Todos podem actualizar o tema (protegido na app)" on public.app_theme
  for all using (true) with check (true);
alter publication supabase_realtime add table public.app_theme;
*/
