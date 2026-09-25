-- ============================================================
-- 005_fix_service_role_triggers.sql
-- ------------------------------------------------------------
-- BUG ENCONTRADO (2026-09-21, a pedido do Abrão: "porque os pacotes não
-- se ativam, tanto no admin como com pagamento online?"):
--
-- Os triggers protect_business_admin_fields() e protect_review_verified()
-- só deixam escrever plan_id/plan_status/plan_renews_at/verified quando
-- public.is_admin() é verdadeiro — e is_admin() é
-- `exists(select 1 from admins where id = auth.uid())`.
--
-- O problema: quando uma Edge Function (zumbopay-webhook, por exemplo)
-- escreve usando a SERVICE_ROLE_KEY, não há nenhum utilizador
-- autenticado no pedido — auth.uid() fica NULL. Logo is_admin() dá
-- sempre falso, e o trigger reverte plan_id/plan_status/plan_renews_at
-- para o valor antigo, MESMO num pagamento real confirmado pela
-- ZumboPay. Silenciosamente — o update "corre bem" (sem erro), só que
-- o trigger desfaz a alteração antes de gravar.
--
-- É a mesma causa, por duas portas diferentes:
--   - Admin: a password do /admin não é uma sessão real do Supabase,
--     por isso auth.uid() também é null aí (bug já documentado antes,
--     "BUG DO ABRÃO 2026-08-23", resolvido do lado do admin com o ecrã
--     de bloqueio — mas o trigger em si continuava por corrigir).
--   - Pagamento online: o webhook usa service_role, que também não tem
--     auth.uid() — nunca tinha sido corrigido até agora.
--
-- CORREÇÃO: deixar passar também quando o pedido usa a service_role key
-- (auth.role() = 'service_role') — só as Edge Functions de confiança
-- (correm no servidor, nunca expostas ao browser) têm essa chave, por
-- isso não abre nenhuma porta para o comerciante se auto-promover.
-- ============================================================

create or replace function public.protect_business_admin_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not (public.is_admin() or auth.role() = 'service_role') then
    new.plan_id := old.plan_id;
    new.plan_status := old.plan_status;
    new.verified := old.verified;
    new.plan_renews_at := old.plan_renews_at;
  end if;
  return new;
end;
$$;

create or replace function public.protect_review_verified()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not (public.is_admin() or auth.role() = 'service_role') then
    new.verified := old.verified;
  end if;
  return new;
end;
$$;
