-- ============================================================
-- Spotter Local — 016: denúncias de conteúdo (chat, posts, eventos)
-- Exigência da Google Play para apps com conteúdo de utilizadores (UGC):
-- o utilizador tem de poder denunciar conteúdo ofensivo dentro da app.
--
-- Cada utilizador só vê/insere as suas denúncias; quem lê todas é o admin.
-- Para moderar: Supabase → SQL Editor →
--   select * from public.content_reports order by created_at desc;
-- Idempotente: pode correr mais do que uma vez.
-- ============================================================
create table if not exists public.content_reports (
  id          uuid primary key default gen_random_uuid(),
  reporter_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  kind        text not null check (kind in ('message','post','event','review','business')),
  target_id   text not null check (length(target_id) between 1 and 80),
  reason      text check (reason is null or length(reason) <= 300),
  status      text not null default 'open' check (status in ('open','reviewed','dismissed')),
  created_at  timestamptz not null default now(),
  unique (reporter_id, kind, target_id)
);

alter table public.content_reports enable row level security;

-- Permissões explícitas: o público (anon) não toca na tabela; quem tem sessão denuncia e vê as suas.
revoke all on public.content_reports from anon;
grant select, insert, update on public.content_reports to authenticated;

drop policy if exists "Utilizador denuncia" on public.content_reports;
create policy "Utilizador denuncia" on public.content_reports
  for insert to authenticated
  with check (reporter_id = auth.uid());

drop policy if exists "Utilizador ve as suas denuncias" on public.content_reports;
create policy "Utilizador ve as suas denuncias" on public.content_reports
  for select to authenticated
  using (reporter_id = auth.uid() or public.is_admin());

drop policy if exists "Admin gere denuncias" on public.content_reports;
create policy "Admin gere denuncias" on public.content_reports
  for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

create index if not exists content_reports_open_idx on public.content_reports (status, created_at desc);
