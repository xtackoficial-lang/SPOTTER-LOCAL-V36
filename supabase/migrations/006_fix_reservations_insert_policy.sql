-- ============================================================
-- 006_fix_reservations_insert_policy.sql
-- ------------------------------------------------------------
-- BUG ENCONTRADO (2026-09-22, auditoria pedida pelo Abrão antes de
-- publicar as reservas): as políticas "owner manage own room
-- reservations" e "owner manage own table reservations", criadas em
-- 004_reservations.sql, usam "for all" — em Postgres isto autoriza
-- SELECT, UPDATE, DELETE **e INSERT** com a mesma condição.
--
-- O comentário no 004 dizia "não há política de INSERT para o
-- cliente, de propósito" — mas "for all" já cria essa política sem
-- querer. Na prática, um comerciante autenticado conseguia, pelo
-- browser (consola / chamada direta ao Supabase), inserir uma
-- reserva já "confirmed" ou "pending_approval" sem nunca ter havido
-- pagamento — sem passar pela Edge Function que calcula a comissão.
--
-- CORREÇÃO: substitui o "for all" por políticas separadas — SELECT,
-- UPDATE e DELETE continuam permitidas ao dono do negócio (precisa de
-- aceitar/recusar/gerir as suas reservas); INSERT deixa de ter
-- qualquer política para o dono, logo fica bloqueado por RLS. As
-- únicas inserções continuam a ser feitas pelas Edge Functions
-- (zumbopay-webhook), que usam a service_role key e por isso ignoram
-- RLS por completo — nada muda no fluxo real de pagamento.
-- ============================================================

-- ---------- room_reservations ----------
drop policy if exists "owner manage own room reservations" on public.room_reservations;

drop policy if exists "owner select own room reservations" on public.room_reservations;
create policy "owner select own room reservations" on public.room_reservations
  for select using (
    business_id in (select id from public.businesses where owner_id = auth.uid())
  );

drop policy if exists "owner update own room reservations" on public.room_reservations;
create policy "owner update own room reservations" on public.room_reservations
  for update using (
    business_id in (select id from public.businesses where owner_id = auth.uid())
  ) with check (
    business_id in (select id from public.businesses where owner_id = auth.uid())
  );

drop policy if exists "owner delete own room reservations" on public.room_reservations;
create policy "owner delete own room reservations" on public.room_reservations
  for delete using (
    business_id in (select id from public.businesses where owner_id = auth.uid())
  );

-- ---------- table_reservations ----------
drop policy if exists "owner manage own table reservations" on public.table_reservations;

drop policy if exists "owner select own table reservations" on public.table_reservations;
create policy "owner select own table reservations" on public.table_reservations
  for select using (
    business_id in (select id from public.businesses where owner_id = auth.uid())
  );

drop policy if exists "owner update own table reservations" on public.table_reservations;
create policy "owner update own table reservations" on public.table_reservations
  for update using (
    business_id in (select id from public.businesses where owner_id = auth.uid())
  ) with check (
    business_id in (select id from public.businesses where owner_id = auth.uid())
  );

drop policy if exists "owner delete own table reservations" on public.table_reservations;
create policy "owner delete own table reservations" on public.table_reservations
  for delete using (
    business_id in (select id from public.businesses where owner_id = auth.uid())
  );

-- Nota: a política "client reads own room/table reservations" (SELECT
-- para o cliente que fez a reserva) já existia no 004 e não é tocada
-- aqui — continua igual.
