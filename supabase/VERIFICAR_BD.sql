-- ============================================================
-- Spotter Local — VERIFICAR_BD.sql
-- Cola no Supabase → SQL Editor e corre. Mostra UMA linha por verificação:
-- estado "OK" ou "FALTA". Tudo o que disser FALTA tem o ficheiro a correr
-- na coluna "corrigir_com". Não altera nada (só lê).
-- ============================================================
with checks(nome, ok, corrigir_com) as (
  values
  -- tabelas base
  ('tabela businesses',            to_regclass('public.businesses') is not null,            'SUPABASE_SETUP.sql'),
  ('tabela admins',                to_regclass('public.admins') is not null,                'SUPABASE_SETUP.sql'),
  ('tabela payments',              to_regclass('public.payments') is not null,              '002_zumbopay_subscriptions.sql'),
  ('tabela business_posts',        to_regclass('public.business_posts') is not null,        '003_posts_events.sql'),
  ('tabela business_rooms',        to_regclass('public.business_rooms') is not null,        '004_reservations.sql'),
  ('tabela room_reservations',     to_regclass('public.room_reservations') is not null,     '004_reservations.sql'),
  ('tabela table_reservations',    to_regclass('public.table_reservations') is not null,    '004_reservations.sql'),
  ('função is_admin()',            to_regprocedure('public.is_admin()') is not null,        'SUPABASE_SETUP.sql'),
  -- colunas usadas pela ZumboPay
  ('payments.zumbopay_payment_id', exists(select 1 from information_schema.columns where table_schema='public' and table_name='payments' and column_name='zumbopay_payment_id'), '008_fix_payments_constraints.sql'),
  ('payments.payment_url',         exists(select 1 from information_schema.columns where table_schema='public' and table_name='payments' and column_name='payment_url'), '008_fix_payments_constraints.sql'),
  ('payments.content_metadata',    exists(select 1 from information_schema.columns where table_schema='public' and table_name='payments' and column_name='content_metadata'), '008_fix_payments_constraints.sql'),
  ('payments.fail_reason',         exists(select 1 from information_schema.columns where table_schema='public' and table_name='payments' and column_name='fail_reason'), 'SUPABASE_SETUP.sql'),
  -- constraints
  ('payments aceita method zumbopay',
     coalesce((select pg_get_constraintdef(oid) like '%zumbopay%' from pg_constraint where conname='payments_method_check' and conrelid='public.payments'::regclass), false), '008_fix_payments_constraints.sql'),
  ('payments aceita plano room/table',
     coalesce((select pg_get_constraintdef(oid) like '%room%' and pg_get_constraintdef(oid) like '%table%' from pg_constraint where conname='payments_plan_id_check' and conrelid='public.payments'::regclass), false), '008_fix_payments_constraints.sql'),
  -- categorias permitidas (009)
  ('função category_allows_room_reservations', to_regprocedure('public.category_allows_room_reservations(text)') is not null, '009_reservation_categories.sql'),
  ('trigger só-categorias-permitidas em businesses', exists(select 1 from pg_trigger where tgname='trg_enforce_reservation_categories'), '009_reservation_categories.sql'),
  ('trigger quartos só em hotéis',  exists(select 1 from pg_trigger where tgname='trg_enforce_rooms_category'), '009_reservation_categories.sql'),
  -- opções de pagamento do quarto (010)
  ('room_reservations.payment_option',   exists(select 1 from information_schema.columns where table_name='room_reservations' and column_name='payment_option'), '010_room_payment_options.sql'),
  ('room_reservations.amount_paid',      exists(select 1 from information_schema.columns where table_name='room_reservations' and column_name='amount_paid'), '010_room_payment_options.sql'),
  ('room_reservations.response_deadline',exists(select 1 from information_schema.columns where table_name='room_reservations' and column_name='response_deadline'), '010_room_payment_options.sql'),
  -- tabelas que a app usa para pedidos, cupões, produtos e eventos
  ('tabela orders',   to_regclass('public.orders') is not null,   'SUPABASE_SETUP.sql'),
  ('tabela coupons',  to_regclass('public.coupons') is not null,  'SUPABASE_SETUP.sql'),
  ('tabela products', to_regclass('public.products') is not null, 'SUPABASE_SETUP.sql'),
  ('tabela events',   to_regclass('public.events') is not null,   '003_posts_events.sql'),
  -- Pensão (011)
  ('business_rooms.price_per_hour', exists(select 1 from information_schema.columns where table_schema='public' and table_name='business_rooms' and column_name='price_per_hour'), '011_pension_hourly.sql'),
  ('room_reservations.booking_unit', exists(select 1 from information_schema.columns where table_schema='public' and table_name='room_reservations' and column_name='booking_unit'), '011_pension_hourly.sql'),
  ('room_reservations.hours', exists(select 1 from information_schema.columns where table_schema='public' and table_name='room_reservations' and column_name='hours'), '011_pension_hourly.sql'),
  ('room_reservations.start_time', exists(select 1 from information_schema.columns where table_schema='public' and table_name='room_reservations' and column_name='start_time'), '011_pension_hourly.sql'),
  ('categoria pension aceita quartos', coalesce(pg_get_functiondef(to_regprocedure('public.category_allows_room_reservations(text)')) like '%pension%', false), '011_pension_hourly.sql'),
  -- Eventos por dia (012) e data de fim (013)
  ('events.expires_at', exists(select 1 from information_schema.columns where table_schema='public' and table_name='events' and column_name='expires_at'), '012_events_per_day.sql'),
  ('regra de eventos esconde os expirados', exists(select 1 from pg_policies where schemaname='public' and tablename='events' and policyname='Todos veem eventos activos' and qual like '%expires_at%'), '012_events_per_day.sql'),
  ('events.event_end_date', exists(select 1 from information_schema.columns where table_schema='public' and table_name='events' and column_name='event_end_date'), '013_event_end_date.sql'),
  ('dono pode apagar os seus eventos', exists(select 1 from pg_policies where schemaname='public' and tablename='events' and policyname='owner delete own events'), '014_owner_delete_events.sql'),
  -- ficheiros (Storage)
  ('bucket spotter-media', exists(select 1 from storage.buckets where id='spotter-media'), 'SUPABASE_SETUP.sql'),
  ('bucket spotter-chat',  exists(select 1 from storage.buckets where id='spotter-chat'),  'SUPABASE_SETUP.sql'),
  -- segurança (RLS ligado)
  ('RLS em payments',            coalesce((select relrowsecurity from pg_class where oid='public.payments'::regclass), false), 'SUPABASE_SETUP.sql / 007'),
  ('RLS em room_reservations',   coalesce((select relrowsecurity from pg_class where oid='public.room_reservations'::regclass), false), '004_reservations.sql'),
  ('RLS em table_reservations',  coalesce((select relrowsecurity from pg_class where oid='public.table_reservations'::regclass), false), '004_reservations.sql'),
  ('RLS em business_rooms',      coalesce((select relrowsecurity from pg_class where oid='public.business_rooms'::regclass), false), '004_reservations.sql'),
  -- Realtime (a app espera confirmação em tempo real)
  ('Realtime: payments',            exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and tablename='payments'), 'Database → Replication → activar payments'),
  ('Realtime: room_reservations',   exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and tablename='room_reservations'), 'Database → Replication → activar room_reservations'),
  ('Realtime: business_rooms',     exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and tablename='business_rooms'), 'Database → Replication → activar business_rooms'),
  ('Realtime: messages',           exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and tablename='messages'), 'SUPABASE_SETUP.sql'),
  ('Realtime: table_reservations',  exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and tablename='table_reservations'), 'Database → Replication → activar table_reservations'),
  -- extensões para o agendamento diário
  ('extensão pg_cron',  exists(select 1 from pg_extension where extname='pg_cron'), 'Database → Extensions → pg_cron'),
  ('extensão pg_net',   exists(select 1 from pg_extension where extname='pg_net'),  'Database → Extensions → pg_net'),
  -- pelo menos 1 admin
  ('existe pelo menos 1 admin', exists(select 1 from public.admins), 'inserir o teu id em public.admins')
)
select nome, case when ok then 'OK' else 'FALTA' end as estado, case when ok then '' else corrigir_com end as corrigir_com
from checks
order by ok, nome;
