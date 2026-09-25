-- ============================================================
-- 007_fix_payment_bypass_policies.sql
-- ------------------------------------------------------------
-- BUG ENCONTRADO (2026-09-22, continuação da auditoria pedida pelo
-- Abrão): o mesmo problema do 006 ("for all" a autorizar INSERT sem
-- querer) também existe em quatro tabelas ligadas a pagamento —
-- estas ainda não tinham sido revistas:
--
--   • business_boosts  (Turbinar)      — comerciante conseguia
--     inserir o próprio boost, grátis, sem nunca passar pela ZumboPay
--     nem pelo admin.
--   • business_posts   (publicações pagas no feed) — comerciante
--     conseguia inserir uma publicação já "active" directamente.
--   • events           (eventos/bilhetes) — mesmo problema, "active"
--     directo.
--   • payments         — sem "with check" nenhum, o comerciante
--     conseguia inserir OU actualizar o seu próprio registo de
--     pagamento para status "confirmed" com qualquer valor/plano,
--     mesmo sem ter pago nada. (Sozinho isto não activava planos —
--     isso já está protegido desde o 005 — mas falsificava o
--     histórico de pagamentos.)
--
-- CORREÇÃO: em vez de "for all" (dono), cada tabela passa a ter:
--   - SELECT: dono continua a ver os seus próprios registos.
--   - INSERT/UPDATE/DELETE: só admin (is_admin()) — nunca o dono
--     directamente. As Edge Functions (zumbopay-webhook) usam a
--     service_role key, que ignora RLS por completo — não precisam
--     de nenhuma política extra para continuar a funcionar.
--   - payments é o único caso em que o dono continua a poder
--     INSERIR (precisa, para criar o pedido antes de pagar), mas
--     agora só com status = 'pending' — nunca "confirmed".
--
-- ⚠️ EFEITO COLATERAL A CONFIRMAR: o botão "aprovar comprovativo"
-- manual do /admin (activateBoost / reviewPaymentProof, para
-- pagamentos M-Pesa/e-Mola manuais, fora da ZumboPay) escreve com a
-- sessão normal do browser, não com service_role. Isso só continua a
-- funcionar depois desta migração se o login do /admin usar mesmo
-- uma sessão Supabase real (auth.uid() a apontar para uma linha em
-- public.admins) — o histórico do projecto sugere que isso pode não
-- estar garantido. Testa esse botão depois de correr este ficheiro;
-- se der erro de permissão, é um bug à parte (autenticação do
-- /admin), não desta migração.
-- ============================================================

-- ---------- business_boosts ----------
drop policy if exists "Dono gere os seus boosts" on public.business_boosts;

drop policy if exists "owner select own boosts" on public.business_boosts;
create policy "owner select own boosts" on public.business_boosts
  for select using (
    auth.uid() = (select owner_id from public.businesses where id = business_id)
  );

drop policy if exists "admin manage boosts" on public.business_boosts;
create policy "admin manage boosts" on public.business_boosts
  for all using (public.is_admin()) with check (public.is_admin());

-- (política pública "Todos vêem boosts activos" já existe, não é tocada)

-- ---------- business_posts ----------
drop policy if exists "Dono gere as suas publicacoes" on public.business_posts;

drop policy if exists "owner select own posts" on public.business_posts;
create policy "owner select own posts" on public.business_posts
  for select using (
    auth.uid() = (select owner_id from public.businesses where id = business_id)
  );

-- (política "Admin gere publicacoes" já existe desde o 003, cobre INSERT/UPDATE/DELETE)

-- ---------- events ----------
drop policy if exists "Dono gere os seus eventos" on public.events;

drop policy if exists "owner select own events" on public.events;
create policy "owner select own events" on public.events
  for select using (
    auth.uid() = (select owner_id from public.businesses where id = business_id)
  );

-- (política "Admin gere eventos" já existe desde o 003, cobre INSERT/UPDATE/DELETE)

-- ---------- payments ----------
drop policy if exists "Dono gere os seus pagamentos" on public.payments;

drop policy if exists "owner select own payments" on public.payments;
create policy "owner select own payments" on public.payments
  for select using (
    auth.uid() = (select owner_id from public.businesses where id = business_id)
  );

-- Dono continua a poder criar o PEDIDO de pagamento (antes de pagar) —
-- mas só como "pending", nunca já confirmado.
drop policy if exists "owner create pending payment" on public.payments;
create policy "owner create pending payment" on public.payments
  for insert with check (
    auth.uid() = (select owner_id from public.businesses where id = business_id)
    and status = 'pending'
    and confirmed_at is null
  );

drop policy if exists "admin manage payments" on public.payments;
create policy "admin manage payments" on public.payments
  for all using (public.is_admin()) with check (public.is_admin());
