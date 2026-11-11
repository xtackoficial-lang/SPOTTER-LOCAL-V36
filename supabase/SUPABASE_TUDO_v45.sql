-- ============================================================================
-- SPOTTER LOCAL v45 — TUDO O QUE FALTA CORRER NO SUPABASE (um só ficheiro)
-- ============================================================================
-- COMO USAR
--   1) Supabase → o teu projeto → SQL Editor → New query.
--   2) Cola ESTE ficheiro inteiro e carrega em RUN. Uma vez chega, mas pode correr
--      mais vezes sem estragar nada (tudo é "se ainda não existe").
--   3) É tudo-ou-nada: se der erro, NADA fica alterado. Copia a mensagem de erro
--      e envia-ma. Não tentes corrigir à mão.
--   4) No fim aparece uma linha: "OK — SQL v45 aplicado".
--   5) Depois corre  VERIFICAR_v45.sql  para confirmares que ficou tudo.
--
-- O QUE FAZ (por ordem)
--   011 Pensão: quarto por hora e por dia
--   012 Eventos: data em que saem da aba (expires_at)
--   013 Eventos: data de fim
--   014 O dono pode apagar os seus eventos (botão "Remover")
--   015 Limite de tentativas de login e de recuperação de senha
--   016 Denúncias de conteúdo (chat, eventos, posts)
--   017 Eventos incluídos nos planos Pro (4/mês) e Premium (8/mês), com dia e hora
--   018 Várias fotos por publicação (carrossel) + dados para notificar seguidores
--
-- ANTES DE CORRER: faz uma cópia de segurança.
--   Supabase → Database → Backups (ou "Scheduled backups"). Se o plano não tiver
--   cópias, usa:  npx supabase db dump -f backup-antes-v45.sql
--
-- NÃO INCLUI: as migrações 002–010 (ZumboPay, reservas, pagamentos). Se nunca as
-- correste, diz-me — o VERIFICAR_v45.sql mostra se estão em falta.
-- ============================================================================
begin;

-- ──────────────────────────────────────────────────────────
-- 011 — Pensão (quarto por hora e por dia)
-- ──────────────────────────────────────────────────────────
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

-- ──────────────────────────────────────────────────────────
-- 012 — Eventos: expira em (expires_at)
-- ──────────────────────────────────────────────────────────
-- ============================================================
-- Spotter Local — 012: eventos pagos por DIA (50 MZN/dia)
-- Correr no Supabase → SQL Editor (idempotente).
-- ============================================================
alter table public.events
  add column if not exists expires_at timestamptz;

-- Só aparecem eventos activos que ainda não passaram os dias pagos.
drop policy if exists "Todos veem eventos activos" on public.events;
create policy "Todos veem eventos activos" on public.events
  for select using (status = 'active' and (expires_at is null or expires_at > now()));

-- ──────────────────────────────────────────────────────────
-- 013 — Eventos: data de fim
-- ──────────────────────────────────────────────────────────
-- ============================================================
-- Spotter Local — 013: data de fim do evento
-- Correr no Supabase → SQL Editor (idempotente).
-- ============================================================
alter table public.events
  add column if not exists event_end_date date;

-- ──────────────────────────────────────────────────────────
-- 014 — O dono pode apagar os seus próprios eventos (botão "Remover")
-- (equivalente a 014_owner_delete_events.sql do repo; se já a correste, as duas
--  políticas coexistem sem problema)
-- ──────────────────────────────────────────────────────────
drop policy if exists "Dono apaga os seus eventos" on public.events;
create policy "Dono apaga os seus eventos" on public.events
  for delete to authenticated
  using (exists (
    select 1 from public.businesses b
     where b.id = events.business_id and b.owner_id = auth.uid()
  ));

-- ──────────────────────────────────────────────────────────
-- 015 — Limite de tentativas de login e recuperação
-- ──────────────────────────────────────────────────────────
-- ============================================================
-- Spotter Local — 015: limite de tentativas (login e recuperação de conta)
-- Correr no Supabase → SQL Editor (idempotente — pode correr mais de uma vez).
--
-- Regras (pedido do Abrão):
--   login    → 3 tentativas erradas  → bloqueio de 30 min; se continuar a falhar,
--              o bloqueio dobra (30 → 60 → 120 → ... até 24 h).
--   recover  → 6 pedidos de recuperação → bloqueio de 30 min (com a mesma subida).
--   Passadas 24 h sem tentativas, o contador volta a zero.
--   Um login certo apaga o contador.
--
-- A tabela NÃO é acessível directamente (RLS ligado, sem policies, sem grants):
-- só pelas 3 funções abaixo. O email é guardado como hash (md5), nunca em claro.
--
-- v42 (revisão): auth_guard_ok só funciona com sessão iniciada E só para o
-- email dessa mesma sessão. Antes, qualquer pessoa sem login podia chamá-la
-- com o email de outra e apagar o contador no meio de um ataque de força bruta.
-- Esta camada é complementar: a protecção real no servidor é o CAPTCHA activado
-- no Supabase (Authentication → Attack Protection) + os limites do próprio Auth.
-- ============================================================
create table if not exists public.auth_guard (
  kind         text        not null check (kind in ('login','recover')),
  ident        text        not null,
  fail_count   int         not null default 0,
  lock_level   int         not null default 0,
  locked_until timestamptz,
  last_at      timestamptz not null default now(),
  primary key (kind, ident)
);
alter table public.auth_guard enable row level security;
revoke all on public.auth_guard from anon, authenticated;

create or replace function public._guard_limit(p_kind text) returns int
language sql immutable as $$
  select case p_kind when 'login' then 3 when 'recover' then 6 else 5 end
$$;

create or replace function public._guard_ident(p_ident text) returns text
language sql immutable as $$
  select md5(lower(btrim(coalesce(p_ident, ''))))
$$;

-- Estado actual: { locked, retry_after, remaining }
create or replace function public.auth_guard_check(p_kind text, p_ident text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  r public.auth_guard%rowtype;
  lim int := public._guard_limit(p_kind);
begin
  if p_kind not in ('login','recover') or p_ident is null or length(p_ident) > 254 then
    return jsonb_build_object('locked', false, 'retry_after', 0, 'remaining', lim);
  end if;
  select * into r from public.auth_guard where kind = p_kind and ident = public._guard_ident(p_ident);
  if not found then
    return jsonb_build_object('locked', false, 'retry_after', 0, 'remaining', lim);
  end if;
  if r.locked_until is not null and r.locked_until > now() then
    return jsonb_build_object('locked', true,
      'retry_after', ceil(extract(epoch from (r.locked_until - now())))::int, 'remaining', 0);
  end if;
  if r.last_at < now() - interval '24 hours' then
    return jsonb_build_object('locked', false, 'retry_after', 0, 'remaining', lim);
  end if;
  return jsonb_build_object('locked', false, 'retry_after', 0, 'remaining', greatest(lim - r.fail_count, 0));
end $$;

-- Regista uma tentativa falhada (login) ou um pedido (recover). Devolve o estado novo.
create or replace function public.auth_guard_fail(p_kind text, p_ident text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  r public.auth_guard%rowtype;
  lim int := public._guard_limit(p_kind);
  h text;
  mins int;
begin
  if p_kind not in ('login','recover') or p_ident is null or length(p_ident) > 254 then
    return jsonb_build_object('locked', false, 'retry_after', 0, 'remaining', lim);
  end if;
  h := public._guard_ident(p_ident);
  -- Limpeza ocasional (≈2% das chamadas): apaga registos parados há 3+ dias e sem bloqueio activo,
  -- para a tabela não crescer sem fim com emails inventados.
  if random() < 0.02 then
    delete from public.auth_guard
     where last_at < now() - interval '3 days' and (locked_until is null or locked_until < now());
  end if;
  insert into public.auth_guard (kind, ident) values (p_kind, h) on conflict (kind, ident) do nothing;
  select * into r from public.auth_guard where kind = p_kind and ident = h for update;

  -- Já bloqueado: não conta mais, só devolve o tempo que falta.
  if r.locked_until is not null and r.locked_until > now() then
    return jsonb_build_object('locked', true,
      'retry_after', ceil(extract(epoch from (r.locked_until - now())))::int, 'remaining', 0);
  end if;
  -- 24 h sem tentativas: recomeça do zero.
  if r.last_at < now() - interval '24 hours' then
    r.fail_count := 0; r.lock_level := 0;
  end if;

  r.fail_count := r.fail_count + 1;
  if r.fail_count >= lim then
    r.lock_level := r.lock_level + 1;
    mins := least(30 * power(2, r.lock_level - 1)::int, 1440);
    update public.auth_guard
       set fail_count = 0, lock_level = r.lock_level, last_at = now(),
           locked_until = now() + make_interval(mins => mins)
     where kind = p_kind and ident = h;
    return jsonb_build_object('locked', true, 'retry_after', mins * 60, 'remaining', 0);
  end if;
  update public.auth_guard
     set fail_count = r.fail_count, lock_level = r.lock_level, last_at = now()
   where kind = p_kind and ident = h;
  return jsonb_build_object('locked', false, 'retry_after', 0, 'remaining', lim - r.fail_count);
end $$;

-- Login certo: apaga o contador. Só com sessão iniciada e só do email da própria sessão.
create or replace function public.auth_guard_ok(p_kind text, p_ident text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_kind in ('login','recover') and p_ident is not null and length(p_ident) <= 254
     and lower(coalesce(auth.jwt() ->> 'email', '')) = lower(btrim(p_ident)) then
    delete from public.auth_guard where kind = p_kind and ident = public._guard_ident(p_ident);
  end if;
end $$;

revoke all on function public.auth_guard_check(text, text) from public;
revoke all on function public.auth_guard_fail(text, text)  from public;
revoke all on function public.auth_guard_ok(text, text)    from public;
grant execute on function public.auth_guard_check(text, text) to anon, authenticated;
grant execute on function public.auth_guard_fail(text, text)  to anon, authenticated;
revoke execute on function public.auth_guard_ok(text, text) from anon;
grant execute on function public.auth_guard_ok(text, text)    to authenticated;

-- ──────────────────────────────────────────────────────────
-- 016 — Denúncias de conteúdo
-- ──────────────────────────────────────────────────────────
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

-- ──────────────────────────────────────────────────────────
-- 017 — Eventos incluídos nos planos Pro e Premium
-- ──────────────────────────────────────────────────────────
-- ============================================================
-- Spotter Local — 017: eventos incluídos nos planos (Pro 4/mês, Premium 8/mês)
-- com data e hora de publicar e de remover. Substitui o pagamento por dia (50 MZN).
--
-- Regras (validadas AQUI, no servidor — a app só mostra):
--   • só planos Pro e Premium, com plano ACTIVO (não "overdue"/"blocked");
--   • quota por mês de publicação: Pro 4, Premium 8 (mês no fuso de Maputo);
--     apagar um evento NÃO devolve a quota (conta no registo event_publish_log);
--   • publicar e remover só em horas certas (minutos = 00) entre as 06h e as 22h (Maputo);
--   • publicar no máximo 60 dias à frente e nunca no passado;
--   • fica visível entre 1 hora e 30 dias;
--   • sai no máximo 1 dia depois do último dia do evento.
-- O comerciante não escreve directamente em events (RLS da 007): só por esta função.
-- Idempotente: pode correr mais do que uma vez. Correr depois da 013 (e da 014/015/016).
-- ============================================================
alter table public.events add column if not exists publish_at timestamptz;
alter table public.events add column if not exists expires_at timestamptz;
alter table public.events add column if not exists event_end_date date;

-- Só aparecem eventos activos, já publicados e ainda não removidos.
drop policy if exists "Todos veem eventos activos" on public.events;
create policy "Todos veem eventos activos" on public.events
  for select using (
    status = 'active'
    and (publish_at is null or publish_at <= now())
    and (expires_at is null or expires_at > now())
  );

-- Registo de publicações (para a quota). Sem policies: só as funções abaixo lhe tocam.
create table if not exists public.event_publish_log (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  month       date not null,
  event_id    uuid,
  created_at  timestamptz not null default now()
);
alter table public.event_publish_log enable row level security;
create index if not exists event_publish_log_biz_month on public.event_publish_log (business_id, month);

-- Quota do plano (fonte da verdade no servidor; manter igual a PLANS em subscription-storage.ts).
create or replace function public._event_quota_for(p_plan text)
returns int language sql immutable as $$
  select case p_plan when 'pro' then 4 when 'premium' then 8 else 0 end;
$$;

-- Quanto já usaste e quanto podes usar no mês da data indicada.
create or replace function public.event_quota_status(p_business_id uuid, p_publish_at timestamptz)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  b record;
  m date;
  used int;
  q int;
begin
  select owner_id, plan_id, plan_status into b from public.businesses where id = p_business_id;
  if not found or b.owner_id is distinct from auth.uid() then
    return jsonb_build_object('allowed', false, 'limit', 0, 'used', 0, 'plan', null);
  end if;
  m := date_trunc('month', (coalesce(p_publish_at, now()) at time zone 'Africa/Maputo'))::date;
  q := public._event_quota_for(b.plan_id);
  select count(*) into used from public.event_publish_log where business_id = p_business_id and month = m;
  return jsonb_build_object(
    'allowed', (q > 0 and b.plan_status = 'active'),
    'limit', q, 'used', used, 'plan', b.plan_id, 'status', b.plan_status
  );
end $$;

-- Publica (ou agenda) um evento. Erros: NOT_OWNER, PLAN_REQUIRED, QUOTA_EXCEEDED, BAD_TIME, BAD_INPUT.
create or replace function public.publish_event_scheduled(
  p_business_id    uuid,
  p_title          text,
  p_poster_url     text,
  p_event_date     date,
  p_event_end_date date,
  p_ticket_phone   text,
  p_ticket_link    text,
  p_city           text,
  p_publish_at     timestamptz,
  p_expires_at     timestamptz
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  b record;
  q int;
  used int;
  m date;
  ph timestamp;
  ex timestamp;
  last_day date;
  new_id uuid;
begin
  if auth.uid() is null then raise exception 'NOT_OWNER'; end if;

  select owner_id, plan_id, plan_status into b from public.businesses where id = p_business_id for update;
  if not found or b.owner_id is distinct from auth.uid() then raise exception 'NOT_OWNER'; end if;

  q := public._event_quota_for(b.plan_id);
  if q = 0 or b.plan_status <> 'active' then raise exception 'PLAN_REQUIRED'; end if;

  -- entradas
  if p_title is null or length(btrim(p_title)) not between 3 and 80
     or p_poster_url is null or p_poster_url !~ '^https?://' or length(p_poster_url) > 600
     or (p_ticket_phone is null and p_ticket_link is null)
     or length(coalesce(p_ticket_phone, '')) > 30 or length(coalesce(p_ticket_link, '')) > 300
     or length(coalesce(p_city, '')) > 80
     or (p_event_end_date is not null and p_event_date is null)
     or (p_event_end_date is not null and p_event_end_date < p_event_date) then
    raise exception 'BAD_INPUT';
  end if;

  -- horas (fuso de Maputo): minutos = 00, entre 06h e 22h
  if p_publish_at is null or p_expires_at is null then raise exception 'BAD_TIME'; end if;
  ph := p_publish_at at time zone 'Africa/Maputo';
  ex := p_expires_at at time zone 'Africa/Maputo';
  if extract(minute from ph) <> 0 or extract(minute from ex) <> 0
     or extract(hour from ph) not between 6 and 22 or extract(hour from ex) not between 6 and 22 then
    raise exception 'BAD_TIME';
  end if;

  -- dias: não no passado, no máximo 60 dias à frente; visível 1 h a 30 dias
  if p_publish_at < now() - interval '2 minutes' or p_publish_at > now() + interval '60 days'
     or p_expires_at < p_publish_at + interval '1 hour'
     or p_expires_at > p_publish_at + interval '30 days' then
    raise exception 'BAD_TIME';
  end if;

  -- sai no máximo 1 dia depois do último dia do evento
  last_day := coalesce(p_event_end_date, p_event_date);
  if last_day is not null and ex::date > last_day + 1 then raise exception 'BAD_TIME'; end if;

  -- quota do mês de publicação
  m := date_trunc('month', ph)::date;
  select count(*) into used from public.event_publish_log where business_id = p_business_id and month = m;
  if used >= q then raise exception 'QUOTA_EXCEEDED'; end if;

  insert into public.events
    (business_id, poster_url, title, ticket_phone, ticket_link, event_date, event_end_date,
     city, tier, status, publish_at, expires_at)
  values
    (p_business_id, p_poster_url, btrim(p_title), nullif(btrim(p_ticket_phone), ''), nullif(btrim(p_ticket_link), ''),
     p_event_date, p_event_end_date, nullif(btrim(p_city), ''), 'standard', 'active', p_publish_at, p_expires_at)
  returning id into new_id;

  insert into public.event_publish_log (business_id, month, event_id) values (p_business_id, m, new_id);

  return jsonb_build_object('ok', true, 'id', new_id, 'used', used + 1, 'limit', q);
end $$;

revoke all on function public.event_quota_status(uuid, timestamptz) from public, anon;
revoke all on function public.publish_event_scheduled(uuid, text, text, date, date, text, text, text, timestamptz, timestamptz) from public, anon;
grant execute on function public.event_quota_status(uuid, timestamptz) to authenticated;
grant execute on function public.publish_event_scheduled(uuid, text, text, date, date, text, text, text, timestamptz, timestamptz) to authenticated;

-- ──────────────────────────────────────────────────────────
-- 018 — Várias fotos por publicação + notificações
-- ──────────────────────────────────────────────────────────
-- ============================================================
-- Spotter Local — 018: publicações com várias fotos (carrossel) + notificação aos seguidores
--
--  • events.photo_urls: até 10 fotos por publicação (a 1.ª é a capa e fica também em poster_url).
--  • events.notified_at: marca quando a notificação já foi enviada (nunca se envia duas vezes).
--  • publish_event_scheduled passa a receber a LISTA de fotos (substitui a versão da 017).
--  • claim_events_to_notify / event_follower_tokens: usadas SÓ pela Edge Function
--    notify-new-events (service_role). Seguidores = clientes que têm o negócio nos favoritos.
-- Correr DEPOIS da 017. Idempotente.
-- ============================================================
alter table public.events add column if not exists photo_urls text[] not null default '{}';
alter table public.events add column if not exists notified_at timestamptz;
-- O registo de quota só é lido/escrito pelas funções da plataforma.
revoke all on public.event_publish_log from anon, authenticated;

create index if not exists events_to_notify_idx on public.events (publish_at) where notified_at is null and status = 'active';

-- Eventos já existentes: a capa passa a ser a única foto da lista.
update public.events set photo_urls = array[poster_url] where cardinality(photo_urls) = 0 and poster_url is not null;
-- Os que já estavam publicados antes desta migração não geram notificação retroactiva.
update public.events set notified_at = now() where notified_at is null and (publish_at is null or publish_at <= now());

-- Substitui a função da 017 (assinatura nova: lista de fotos em vez de uma só).
drop function if exists public.publish_event_scheduled(uuid, text, text, date, date, text, text, text, timestamptz, timestamptz);

create or replace function public.publish_event_scheduled(
  p_business_id    uuid,
  p_title          text,
  p_photo_urls     text[],
  p_event_date     date,
  p_event_end_date date,
  p_ticket_phone   text,
  p_ticket_link    text,
  p_city           text,
  p_publish_at     timestamptz,
  p_expires_at     timestamptz
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  b record;
  q int;
  used int;
  m date;
  ph timestamp;
  ex timestamp;
  last_day date;
  new_id uuid;
begin
  if auth.uid() is null then raise exception 'NOT_OWNER'; end if;

  select owner_id, plan_id, plan_status into b from public.businesses where id = p_business_id for update;
  if not found or b.owner_id is distinct from auth.uid() then raise exception 'NOT_OWNER'; end if;

  q := public._event_quota_for(b.plan_id);
  if q = 0 or b.plan_status <> 'active' then raise exception 'PLAN_REQUIRED'; end if;

  -- entradas (1 a 10 fotos, todas http/https)
  if p_title is null or length(btrim(p_title)) not between 3 and 80
     or p_photo_urls is null or cardinality(p_photo_urls) not between 1 and 10
     or exists (select 1 from unnest(p_photo_urls) u where u is null or u !~ '^https?://' or length(u) > 600)
     or (p_ticket_phone is null and p_ticket_link is null)
     or length(coalesce(p_ticket_phone, '')) > 30 or length(coalesce(p_ticket_link, '')) > 300
     or length(coalesce(p_city, '')) > 80
     or (p_event_end_date is not null and p_event_date is null)
     or (p_event_end_date is not null and p_event_end_date < p_event_date) then
    raise exception 'BAD_INPUT';
  end if;

  -- horas (fuso de Maputo): minutos = 00, entre 06h e 22h
  if p_publish_at is null or p_expires_at is null then raise exception 'BAD_TIME'; end if;
  ph := p_publish_at at time zone 'Africa/Maputo';
  ex := p_expires_at at time zone 'Africa/Maputo';
  if extract(minute from ph) <> 0 or extract(minute from ex) <> 0
     or extract(hour from ph) not between 6 and 22 or extract(hour from ex) not between 6 and 22 then
    raise exception 'BAD_TIME';
  end if;

  -- dias: não no passado, no máximo 60 dias à frente; visível 1 h a 30 dias
  if p_publish_at < now() - interval '2 minutes' or p_publish_at > now() + interval '60 days'
     or p_expires_at < p_publish_at + interval '1 hour'
     or p_expires_at > p_publish_at + interval '30 days' then
    raise exception 'BAD_TIME';
  end if;

  -- sai no máximo 1 dia depois do último dia do evento
  last_day := coalesce(p_event_end_date, p_event_date);
  if last_day is not null and ex::date > last_day + 1 then raise exception 'BAD_TIME'; end if;

  -- quota do mês de publicação
  m := date_trunc('month', ph)::date;
  select count(*) into used from public.event_publish_log where business_id = p_business_id and month = m;
  if used >= q then raise exception 'QUOTA_EXCEEDED'; end if;

  insert into public.events
    (business_id, poster_url, photo_urls, title, ticket_phone, ticket_link, event_date, event_end_date,
     city, tier, status, publish_at, expires_at)
  values
    (p_business_id, p_photo_urls[1], p_photo_urls, btrim(p_title), nullif(btrim(p_ticket_phone), ''),
     nullif(btrim(p_ticket_link), ''), p_event_date, p_event_end_date, nullif(btrim(p_city), ''),
     'standard', 'active', p_publish_at, p_expires_at)
  returning id into new_id;

  insert into public.event_publish_log (business_id, month, event_id) values (p_business_id, m, new_id);

  return jsonb_build_object('ok', true, 'id', new_id, 'used', used + 1, 'limit', q);
end $$;

revoke all on function public.publish_event_scheduled(uuid, text, text[], date, date, text, text, text, timestamptz, timestamptz) from public, anon;
grant execute on function public.publish_event_scheduled(uuid, text, text[], date, date, text, text, text, timestamptz, timestamptz) to authenticated;

-- ── Notificações: só a Edge Function notify-new-events (service_role) chama estas duas ──

-- Reserva (marca como notificados) os eventos que acabaram de ficar visíveis, de forma atómica:
-- duas execuções ao mesmo tempo nunca enviam o mesmo evento duas vezes. Ignora eventos com mais de 24 h.
create or replace function public.claim_events_to_notify(p_limit int default 20)
returns table (event_id uuid, business_id uuid, business_name text, title text, photo_count int, image_url text, city text)
language sql security definer set search_path = public as $$
  with due as (
    select e.id from public.events e
     where e.status = 'active' and e.notified_at is null and e.publish_at is not null
       and e.publish_at <= now() and e.publish_at > now() - interval '24 hours'
       and (e.expires_at is null or e.expires_at > now())
     order by e.publish_at
     limit greatest(1, least(coalesce(p_limit, 20), 50))
     for update skip locked
  ), upd as (
    update public.events e set notified_at = now() from due where e.id = due.id
    returning e.id, e.business_id, e.title, e.photo_urls, e.poster_url, e.city
  )
  select upd.id, upd.business_id, b.business_name, upd.title,
         greatest(coalesce(cardinality(upd.photo_urls), 0), 1),
         coalesce(upd.photo_urls[1], upd.poster_url), upd.city
  from upd join public.businesses b on b.id = upd.business_id;
$$;

-- Tokens dos seguidores (clientes com o negócio nos favoritos), sem o dono.
create or replace function public.event_follower_tokens(p_business_id uuid)
returns table (token text)
language sql security definer set search_path = public as $$
  select distinct t.token
    from public.favorites f
    join public.push_tokens t on t.user_id = f.user_id
    join public.businesses b on b.id = f.business_id
   where f.business_id = p_business_id
     and f.user_id is distinct from b.owner_id
     and t.token is not null;
$$;

revoke all on function public.claim_events_to_notify(int) from public, anon, authenticated;
revoke all on function public.event_follower_tokens(uuid) from public, anon, authenticated;
grant execute on function public.claim_events_to_notify(int) to service_role;
grant execute on function public.event_follower_tokens(uuid) to service_role;

commit;

select 'OK — SQL v45 aplicado' as resultado;
