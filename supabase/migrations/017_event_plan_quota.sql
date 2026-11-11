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
