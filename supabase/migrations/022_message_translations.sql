-- 022 — Tradução de mensagens do chat (botão "Traduzir").
-- Guarda cada tradução (para não pagar duas vezes a mesma mensagem) e conta os
-- caracteres traduzidos por mês (para parar antes de passar o limite grátis).
-- Só a service_role (Edge Function translate-message) acede; o browser não.
-- Idempotente.
create table if not exists public.message_translations (
  message_id uuid        not null references public.messages(id) on delete cascade,
  lang       text        not null check (lang in ('pt','en','es','fr')),
  translated text        not null,
  detected   text,
  created_at timestamptz not null default now(),
  primary key (message_id, lang)
);
alter table public.message_translations enable row level security;  -- sem policies

create table if not exists public.translation_usage (
  month text primary key,           -- 'YYYY-MM'
  chars bigint not null default 0
);
alter table public.translation_usage enable row level security;

-- Reserva p_chars do orçamento do mês de forma atómica.
-- allowed = false (e nada é somado) se passasse de p_cap.
create or replace function public.reserve_translation_chars(p_month text, p_chars integer, p_cap bigint)
returns table (allowed boolean, used bigint)
language plpgsql
security definer
set search_path = public
as $$
declare v_used bigint;
begin
  if p_chars < 1 or p_cap < 1 or p_month !~ '^[0-9]{4}-[0-9]{2}$' then
    raise exception 'invalid arguments';
  end if;
  insert into public.translation_usage as t (month, chars) values (p_month, 0)
    on conflict (month) do nothing;
  update public.translation_usage t
     set chars = t.chars + p_chars
   where t.month = p_month and t.chars + p_chars <= p_cap
   returning t.chars into v_used;
  if v_used is null then
    select t.chars into v_used from public.translation_usage t where t.month = p_month;
    allowed := false;
  else
    allowed := true;
  end if;
  used := v_used;
  return next;
end;
$$;
revoke all on function public.reserve_translation_chars(text, integer, bigint) from public, anon, authenticated;
grant execute on function public.reserve_translation_chars(text, integer, bigint) to service_role;

-- Devolve caracteres reservados quando o pedido ao serviço falhou.
create or replace function public.refund_translation_chars(p_month text, p_chars integer)
returns void
language sql
security definer
set search_path = public
as $$
  update public.translation_usage set chars = greatest(chars - p_chars, 0) where month = p_month;
$$;
revoke all on function public.refund_translation_chars(text, integer) from public, anon, authenticated;
grant execute on function public.refund_translation_chars(text, integer) to service_role;
