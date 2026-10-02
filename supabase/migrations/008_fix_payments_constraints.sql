-- ============================================================
-- Spotter Local — 008: corrige constraints da tabela payments
-- Correr no Supabase → SQL Editor (seguro repetir: é idempotente).
--
-- 1) method: aceitar 'zumbopay' (a Edge Function grava method='zumbopay')
-- 2) plan_id: aceitar 'room' e 'table' (reservas de quarto/mesa pagas
--    via ZumboPay). Sem isto, o INSERT dessas reservas falhava com
--    "violates check constraint payments_plan_id_check".
-- 3) colunas usadas pela integração (caso a 002/003 não tenha corrido)
-- ============================================================

alter table public.payments drop constraint if exists payments_method_check;
alter table public.payments
  add constraint payments_method_check
  check (method in ('mpesa', 'emola', 'manual', 'zumbopay'));

alter table public.payments drop constraint if exists payments_plan_id_check;
alter table public.payments
  add constraint payments_plan_id_check
  check (plan_id in ('free','starter','pro','premium','boost','post','event','room','table'));

alter table public.payments add column if not exists zumbopay_reference text;
alter table public.payments add column if not exists zumbopay_payment_id text;
alter table public.payments add column if not exists payment_url text;
alter table public.payments add column if not exists content_metadata jsonb;
alter table public.payments add column if not exists boost_package_id text;

create index if not exists idx_payments_zumbopay_payment_id
  on public.payments(zumbopay_payment_id);

-- 4) boost_package_id: a Edge Function usa esta coluna também para o pacote
--    de PUBLICAÇÃO ('24h','3d','7d') e para o nível de EVENTO ('standard',
--    'featured'). A constraint original só aceitava '1d','7d','30d' — por isso
--    pagar uma publicação de 24h/3d ou qualquer evento falhava com
--    "Falha ao registar o pagamento" (descoberto nos testes de 2026-10-01).
alter table public.payments drop constraint if exists payments_boost_package_id_check;
alter table public.payments
  add constraint payments_boost_package_id_check
  check (boost_package_id is null or boost_package_id in ('1d','7d','30d','24h','3d','standard','featured'));
