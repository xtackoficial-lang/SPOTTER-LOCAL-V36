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
