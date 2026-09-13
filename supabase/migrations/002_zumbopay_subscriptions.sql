-- ============================================================
-- Spotter Local — Integração ZumboPay (assinaturas: starter/pro/premium)
-- Correr no Supabase SQL Editor depois do SUPABASE_SETUP.sql principal.
-- Só toca na tabela "payments" que já existe — não mexe em reservas
-- nem em pedidos (isso fica para depois, como combinado).
-- ============================================================

-- 1) Novo método de pagamento permitido
alter table public.payments drop constraint if exists payments_method_check;
alter table public.payments
  add constraint payments_method_check
  check (method in ('mpesa', 'emola', 'manual', 'zumbopay'));

-- 2) Campos novos para rastrear o pagamento na ZumboPay
alter table public.payments add column if not exists zumbopay_reference text;
alter table public.payments add column if not exists zumbopay_payment_id text;
alter table public.payments add column if not exists payment_url text;

create index if not exists idx_payments_zumbopay_reference
  on public.payments(zumbopay_reference);

create index if not exists idx_payments_zumbopay_payment_id
  on public.payments(zumbopay_payment_id);

-- 3b) CRÍTICO — sem isto, a subscrição em tempo real no payment.tsx
--     (supabase.channel(...).on("postgres_changes", ...)) NUNCA dispara.
--     É o que faz a app do comerciante avançar sozinha para "Plano
--     activado" assim que o webhook confirma o pagamento.
alter publication supabase_realtime add table public.payments;

-- 3c) Evita duas linhas "pending" para o mesmo pagamento em caso de
--     clique duplo/repetido antes da Edge Function responder.
create unique index if not exists idx_payments_merchant_ref_unique
  on public.payments(merchant_ref);

