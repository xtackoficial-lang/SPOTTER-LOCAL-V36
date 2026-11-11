-- 020 — Notificações: passar o token do aparelho para a conta que entrou.
-- Problema: a tabela push_tokens só deixa cada conta mexer nas suas linhas. Se a
-- conta A saía sem soltar o token (sessão expirada, app fechada), a conta B
-- não conseguia reclamá-lo e o telemóvel continuava a receber as notificações
-- de A. Esta função (corre no servidor) atribui o token a quem a chama.
-- Idempotente: pode correr mais do que uma vez.
create or replace function public.claim_push_token(p_token text, p_platform text default 'web')
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  if p_token is null or length(p_token) < 20 then
    raise exception 'invalid token';
  end if;
  insert into public.push_tokens (user_id, token, platform, last_seen_at)
  values (auth.uid(), p_token, case when p_platform in ('web','android','ios') then p_platform else 'web' end, now())
  on conflict (token) do update
    set user_id = auth.uid(), platform = excluded.platform, last_seen_at = now();
end;
$$;
revoke all on function public.claim_push_token(text, text) from public;
grant execute on function public.claim_push_token(text, text) to authenticated;
