-- 021 — Rate limiting no servidor (limite de pedidos por utilizador/IP).
-- Janela fixa: no máximo p_limit pedidos por chave em cada p_window_seconds.
-- Usado pelas Edge Functions (ver supabase/functions/_shared/rate-limit.ts).
-- Só a service_role (as Edge Functions) pode chamar; o browser não tem acesso.
-- Idempotente: pode correr mais do que uma vez.
create table if not exists public.rate_limits (
  key          text        not null,
  window_start timestamptz not null,
  count        integer     not null default 0,
  primary key (key, window_start)
);
alter table public.rate_limits enable row level security;  -- sem policies: ninguém lê/escreve pela API
create index if not exists rate_limits_window_idx on public.rate_limits (window_start);

create or replace function public.check_rate_limit(p_key text, p_limit integer, p_window_seconds integer)
returns table (allowed boolean, remaining integer, retry_after integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_window timestamptz;
  v_count  integer;
  v_now    timestamptz := now();
begin
  if p_key is null or length(p_key) = 0 or length(p_key) > 200 then
    raise exception 'invalid key';
  end if;
  if p_limit < 1 or p_window_seconds < 1 then
    raise exception 'invalid limit';
  end if;
  -- início da janela atual (alinhado ao relógio)
  v_window := to_timestamp(floor(extract(epoch from v_now) / p_window_seconds) * p_window_seconds);
  insert into public.rate_limits as r (key, window_start, count)
  values (p_key, v_window, 1)
  on conflict (key, window_start) do update set count = r.count + 1
  returning r.count into v_count;

  allowed     := v_count <= p_limit;
  remaining   := greatest(p_limit - v_count, 0);
  retry_after := case when v_count <= p_limit then 0
                      else greatest(ceil(extract(epoch from (v_window + make_interval(secs => p_window_seconds) - v_now)))::integer, 1) end;
  return next;
end;
$$;
revoke all on function public.check_rate_limit(text, integer, integer) from public, anon, authenticated;
grant execute on function public.check_rate_limit(text, integer, integer) to service_role;

-- Limpeza de janelas antigas (corre 1×/hora se existir pg_cron; senão pode ser chamada à mão).
create or replace function public.purge_rate_limits()
returns integer
language sql
security definer
set search_path = public
as $$
  with d as (delete from public.rate_limits where window_start < now() - interval '1 day' returning 1)
  select count(*)::integer from d;
$$;
revoke all on function public.purge_rate_limits() from public, anon, authenticated;
grant execute on function public.purge_rate_limits() to service_role;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'limpar-rate-limits';
    perform cron.schedule('limpar-rate-limits', '17 * * * *', 'select public.purge_rate_limits()');
  end if;
end $$;
