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
