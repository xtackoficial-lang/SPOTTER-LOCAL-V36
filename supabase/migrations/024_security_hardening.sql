-- 024 — Endurecimento de segurança (já aplicado no Supabase em 2026-11-15).
-- 1) messages: o remetente tem de ser quem está autenticado; o destinatário só pode marcar como lida.
-- 2) businesses: no INSERT, quem não é admin não pode criar já com plano pago / verificado.
-- 3) profiles: ninguém se pode "des-suspender" a si próprio.
-- 4) funções de trigger deixam de ser chamáveis por /rest/v1/rpc.
-- 5) search_path fixo nas funções assinaladas pelo linter.

create or replace function public.guard_messages()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  if coalesce(auth.role(), '') = 'service_role' or current_user in ('postgres', 'supabase_admin') then
    return new;
  end if;
  if tg_op = 'INSERT' then
    if new.sender_id is distinct from auth.uid() then
      raise exception 'sender_id tem de ser o utilizador autenticado';
    end if;
    return new;
  end if;
  if auth.uid() is distinct from old.receiver_id
     or (to_jsonb(new) - 'read') is distinct from (to_jsonb(old) - 'read') then
    raise exception 'só é permitido marcar mensagens recebidas como lidas';
  end if;
  return new;
end $$;

create or replace function public.protect_business_on_insert()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  if not (public.is_admin() or coalesce(auth.role(), '') = 'service_role' or current_user in ('postgres', 'supabase_admin')) then
    new.plan_id := 'free';
    new.plan_status := 'active';
    new.verified := false;
    new.plan_renews_at := null;
  end if;
  return new;
end $$;

create or replace function public.protect_profile_admin_fields()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  if not (public.is_admin() or coalesce(auth.role(), '') = 'service_role' or current_user in ('postgres', 'supabase_admin')) then
    if tg_op = 'INSERT' then
      new.suspended := false;
    else
      new.suspended := old.suspended;
    end if;
  end if;
  return new;
end $$;

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'trg_guard_messages' and tgrelid = 'public.messages'::regclass) then
    create trigger trg_guard_messages before insert or update on public.messages
      for each row execute function public.guard_messages();
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'trg_protect_business_on_insert' and tgrelid = 'public.businesses'::regclass) then
    create trigger trg_protect_business_on_insert before insert on public.businesses
      for each row execute function public.protect_business_on_insert();
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'trg_protect_profile_admin_fields' and tgrelid = 'public.profiles'::regclass) then
    create trigger trg_protect_profile_admin_fields before insert or update on public.profiles
      for each row execute function public.protect_profile_admin_fields();
  end if;
end $$;

revoke all on function public.guard_messages() from public, anon, authenticated;
revoke all on function public.protect_business_on_insert() from public, anon, authenticated;
revoke all on function public.protect_profile_admin_fields() from public, anon, authenticated;
revoke all on function public.handle_new_user() from public, anon, authenticated;
revoke all on function public.handle_user_updated() from public, anon, authenticated;
revoke all on function public.protect_business_admin_fields() from public, anon, authenticated;
revoke all on function public.protect_review_verified() from public, anon, authenticated;
revoke all on function public.auth_guard_ok(text, text) from public, anon;

do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure as sig
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('increment_analytic','update_business_rating','set_updated_at','increment_helpful',
        'category_allows_room_reservations','category_allows_table_reservations','enforce_reservation_categories',
        'enforce_rooms_category','_guard_limit','_guard_ident','_event_quota_for')
  loop
    execute format('alter function %s set search_path = public, extensions, pg_temp', r.sig);
  end loop;
end $$;
