-- ============================================================================
-- SPOTTER LOCAL v45 — VERIFICAR (só lê, não altera nada)
-- Cola no SQL Editor e carrega RUN. Os ❌ aparecem primeiro.
-- Se tudo estiver ✅, a base de dados está pronta para a v45.
-- ============================================================================
with checks(item, ok) as (
  -- tabelas
  select 'tabela events',                    to_regclass('public.events') is not null
  union all select 'tabela businesses',      to_regclass('public.businesses') is not null
  union all select 'tabela business_rooms',  to_regclass('public.business_rooms') is not null
  union all select 'tabela room_reservations', to_regclass('public.room_reservations') is not null
  union all select 'tabela favorites (seguidores)', to_regclass('public.favorites') is not null
  union all select 'tabela push_tokens (notificações)', to_regclass('public.push_tokens') is not null
  union all select 'tabela event_publish_log (quota)', to_regclass('public.event_publish_log') is not null
  union all select 'tabela content_reports (denúncias)', to_regclass('public.content_reports') is not null
  union all select 'tabela auth_guard (limite de login)', to_regclass('public.auth_guard') is not null
  -- colunas
  union all select 'coluna business_rooms.price_per_hour (011)', exists(select 1 from information_schema.columns where table_schema='public' and table_name='business_rooms' and column_name='price_per_hour')
  union all select 'coluna room_reservations.booking_unit (011)', exists(select 1 from information_schema.columns where table_schema='public' and table_name='room_reservations' and column_name='booking_unit')
  union all select 'coluna events.expires_at (012)',    exists(select 1 from information_schema.columns where table_schema='public' and table_name='events' and column_name='expires_at')
  union all select 'coluna events.event_end_date (013)', exists(select 1 from information_schema.columns where table_schema='public' and table_name='events' and column_name='event_end_date')
  union all select 'coluna events.publish_at (017)',    exists(select 1 from information_schema.columns where table_schema='public' and table_name='events' and column_name='publish_at')
  union all select 'coluna events.photo_urls (018)',    exists(select 1 from information_schema.columns where table_schema='public' and table_name='events' and column_name='photo_urls')
  union all select 'coluna events.notified_at (018)',   exists(select 1 from information_schema.columns where table_schema='public' and table_name='events' and column_name='notified_at')
  -- funções
  union all select 'função publish_event_scheduled (fotos, 018)', to_regprocedure('public.publish_event_scheduled(uuid,text,text[],date,date,text,text,text,timestamptz,timestamptz)') is not null
  union all select 'função ANTIGA publish_event_scheduled removida', to_regprocedure('public.publish_event_scheduled(uuid,text,text,date,date,text,text,text,timestamptz,timestamptz)') is null
  union all select 'função event_quota_status (017)',    to_regprocedure('public.event_quota_status(uuid,timestamptz)') is not null
  union all select 'função claim_events_to_notify (018)', to_regprocedure('public.claim_events_to_notify(int)') is not null
  union all select 'função event_follower_tokens (018)',  to_regprocedure('public.event_follower_tokens(uuid)') is not null
  union all select 'função auth_guard_check (015)',       to_regprocedure('public.auth_guard_check(text,text)') is not null
  union all select 'função auth_guard_fail (015)',        to_regprocedure('public.auth_guard_fail(text,text)') is not null
  union all select 'função auth_guard_ok (015)',          to_regprocedure('public.auth_guard_ok(text,text)') is not null
  -- segurança (RLS e permissões)
  union all select 'RLS ligado em events',            coalesce((select relrowsecurity from pg_class where oid = to_regclass('public.events')), false)
  union all select 'RLS ligado em content_reports',   coalesce((select relrowsecurity from pg_class where oid = to_regclass('public.content_reports')), false)
  union all select 'RLS ligado em auth_guard',        coalesce((select relrowsecurity from pg_class where oid = to_regclass('public.auth_guard')), false)
  union all select 'RLS ligado em event_publish_log', coalesce((select relrowsecurity from pg_class where oid = to_regclass('public.event_publish_log')), false)
  union all select 'eventos agendados escondidos do público (política usa publish_at)',
         exists(select 1 from pg_policies where schemaname='public' and tablename='events' and policyname='Todos veem eventos activos' and qual ilike '%publish_at%')
  union all select 'o dono pode apagar os seus eventos (014)',
         exists(select 1 from pg_policies where schemaname='public' and tablename='events' and cmd='DELETE' and policyname <> 'Admin gere eventos')
  union all select 'ninguém publica eventos direto na tabela (só pela função da plataforma)',
         not exists(select 1 from pg_policies where schemaname='public' and tablename='events' and cmd in ('INSERT','UPDATE','ALL') and roles::text not ilike '%service_role%' and policyname not ilike '%admin%')
  union all select 'notificações: o público NÃO pode chamar claim_events_to_notify',
         to_regprocedure('public.claim_events_to_notify(int)') is not null
         and not has_function_privilege('anon', 'public.claim_events_to_notify(int)', 'execute')
         and not has_function_privilege('authenticated', 'public.claim_events_to_notify(int)', 'execute')
  union all select 'notificações: só service_role chama claim_events_to_notify',
         to_regprocedure('public.claim_events_to_notify(int)') is not null
         and has_function_privilege('service_role', 'public.claim_events_to_notify(int)', 'execute')
  union all select 'auth_guard_ok só para quem tem sessão (anon não pode)',
         to_regprocedure('public.auth_guard_ok(text,text)') is not null
         and not has_function_privilege('anon', 'public.auth_guard_ok(text,text)', 'execute')
  -- extensões para o agendamento das notificações
  union all select 'extensão pg_cron ativa (precisa para notificar)', exists(select 1 from pg_extension where extname='pg_cron')
  union all select 'extensão pg_net ativa (precisa para notificar)',  exists(select 1 from pg_extension where extname='pg_net')
)
select case when ok then '✅' else '❌' end as estado, item
from checks
order by ok, item;

-- Depois de correres  3_CRON_EVENTOS.sql  (só funciona com pg_cron ativo), confirma o agendamento:
--   select jobname, schedule, active from cron.job where jobname = 'notificar-novas-publicacoes';
-- E vê as últimas execuções:
--   select status, return_message, start_time from cron.job_run_details order by start_time desc limit 10;
-- Notificações enviadas:
--   select title, body, recipients_count, success_count, sent_at from public.push_log where target = 'event_followers' order by sent_at desc limit 10;
